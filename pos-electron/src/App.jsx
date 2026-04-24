import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { addItem, clearCart, removeItem } from "./store/slices/billingSlice.js";
import { computeLinePrice } from "./lib/pricing.js";

const API_BASE = "http://localhost:4200";

const navItems = [
  { key: "dashboard", label: "Dashboard" },
  { key: "billing", label: "Billing (POS)" },
  { key: "products", label: "Products" },
  { key: "customers", label: "Customers" },
  { key: "inventory", label: "Inventory" },
  { key: "gold", label: "Gold Rates" },
  { key: "reports", label: "Reports" },
  { key: "expenses", label: "Expenses" },
  { key: "users", label: "Users" },
  { key: "settings", label: "Settings" }
];

function formatInr(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value || 0);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const emptyProduct = {
  name: "",
  category: "gold",
  purity: "22k",
  weight_grams: "",
  making_charges: "",
  barcode: ""
};

export default function App() {
  const dispatch = useDispatch();
  const cart = useSelector((state) => state.billing.cart);
  const [activeView, setActiveView] = useState("billing");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [goldRate, setGoldRate] = useState(6500);
  const [error, setError] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [invoiceResult, setInvoiceResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [printStatus, setPrintStatus] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [authUser, setAuthUser] = useState("admin");
  const [authPassword, setAuthPassword] = useState("admin123");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("Please login to enable invoice, print and CRUD actions.");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [crudMessage, setCrudMessage] = useState("");

  useEffect(() => {
    fetchProducts();
    loadTodayRate();
  }, []);

  function authHeaders() {
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }

  async function loginLocal(username = authUser, password = authPassword) {
    try {
      setAuthLoading(true);
      setError("");
      const { data } = await axios.post(`${API_BASE}/api/auth/login`, {
        username,
        password
      });
      const token = data?.data?.access_token || "";
      setAccessToken(token);
      setAuthMessage(token ? `Authenticated as ${username}` : "Login succeeded but no token returned.");
      if (!token) {
        setError("Login succeeded, but no access token was returned from the API.");
      }
    } catch (e) {
      setAccessToken("");
      setAuthMessage("Authentication failed. Please verify credentials.");
      setError(e?.response?.data?.message || "Login failed for local API.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadTodayRate() {
    try {
      const { data } = await axios.get(`${API_BASE}/api/rates/today`, { params: { metal: "gold" } });
      setGoldRate(Number(data?.data?.rate_per_gram || 0));
    } catch {
      setError("Gold rate fetch failed. Using manual rate.");
    }
  }

  async function fetchProducts() {
    try {
      setCatalogLoading(true);
      const { data } = await axios.get(`${API_BASE}/api/products`);
      setCatalog(data?.data || []);
    } catch {
      setError("Failed to fetch products from local SQL DB API.");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function searchProducts() {
    try {
      setError("");
      if (!q.trim()) {
        setResults([]);
        return;
      }
      const isBarcode = /^\d{6,}$/.test(q.trim());
      if (isBarcode) {
        const { data } = await axios.get(`${API_BASE}/api/products/barcode/${q.trim()}`);
        if (data?.data) {
          setResults([data.data]);
          return;
        }
        setResults([]);
      } else {
        const { data } = await axios.get(`${API_BASE}/api/products`, { params: { q } });
        setResults(data?.data || []);
      }
    } catch {
      setResults([]);
      setError("Product lookup failed. Check local API or MySQL connection.");
    }
  }

  function startEditProduct(product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name || "",
      category: product.category || "gold",
      purity: product.purity || "22k",
      weight_grams: String(product.weight_grams || ""),
      making_charges: String(product.making_charges || ""),
      barcode: product.barcode || ""
    });
    setCrudMessage(`Editing ${product.name}`);
  }

  function resetProductForm() {
    setEditingProductId(null);
    setProductForm(emptyProduct);
    setCrudMessage("");
  }

  async function saveProduct() {
    try {
      setCrudMessage("");
      if (!accessToken) {
        setError("Please login first to create or update products.");
        return;
      }
      const payload = {
        ...productForm,
        weight_grams: Number(productForm.weight_grams || 0),
        making_charges: Number(productForm.making_charges || 0)
      };
      if (editingProductId) {
        await axios.put(`${API_BASE}/api/products/${editingProductId}`, payload, {
          headers: authHeaders()
        });
        setCrudMessage("Product updated successfully.");
      } else {
        await axios.post(`${API_BASE}/api/products`, payload, {
          headers: authHeaders()
        });
        setCrudMessage("Product created successfully.");
      }
      resetProductForm();
      fetchProducts();
      if (q.trim()) searchProducts();
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to save product.");
    }
  }

  async function deleteProduct(id) {
    try {
      if (!accessToken) {
        setError("Please login first to delete products.");
        return;
      }
      await axios.delete(`${API_BASE}/api/products/${id}`, {
        headers: authHeaders()
      });
      setCrudMessage("Product deleted successfully.");
      fetchProducts();
      if (q.trim()) searchProducts();
      if (editingProductId === id) resetProductForm();
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to delete product.");
    }
  }

  async function finalizeInvoice() {
    try {
      if (!cart.length) return;
      if (!accessToken) throw new Error("Not authenticated. Please login from the POS Login card.");
      setIsSubmitting(true);
      setError("");
      const payload = {
        cashier_id: "11111111-1111-1111-1111-111111111111",
        payment_mode: paymentMode,
        items: cart.map((item) => ({
          barcode: item.barcode,
          quantity: item.quantity
        }))
      };
      const { data } = await axios.post(`${API_BASE}/api/invoices`, payload, {
        headers: authHeaders()
      });
      setInvoiceResult(data?.data || null);
      setPrintStatus("");
      dispatch(clearCart());
      setResults([]);
      setQ("");
      fetchProducts();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Invoice finalization failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function printInvoice(invoiceId) {
    try {
      if (!accessToken) throw new Error("Not authenticated. Please login from the POS Login card.");
      setPrintStatus("");
      await axios.post(`${API_BASE}/api/print/invoice/${invoiceId}`, {}, {
        headers: authHeaders()
      });
      setPrintStatus("Invoice printed successfully.");
    } catch (e) {
      setPrintStatus(e?.response?.data?.message || e?.message || "Printer unavailable. Please check thermal printer.");
    }
  }

  const totals = useMemo(() => {
    return cart.reduce(
      (acc, item) => {
        const line = computeLinePrice(item, goldRate);
        acc.taxable += line.taxable * item.quantity;
        acc.cgst += line.cgst * item.quantity;
        acc.sgst += line.sgst * item.quantity;
        acc.grand += line.total * item.quantity;
        return acc;
      },
      { taxable: 0, cgst: 0, sgst: 0, grand: 0 }
    );
  }, [cart, goldRate]);

  const stats = [
    { label: "Total Sales", value: formatInr(totals.grand), hint: "Current cart value" },
    { label: "Items in Cart", value: cart.length, hint: "Ready for billing" },
    { label: "Products (SQL)", value: catalog.length, hint: catalogLoading ? "Syncing..." : "Loaded from local DB" },
    { label: "Auth Status", value: accessToken ? "Logged In" : "Login Required", hint: authMessage }
  ];

  const lookupList = q.trim() ? results : catalog;

  return (
    <div className="appShell">
      <aside className="sideNav">
        <div className="brand">
          <h2>JEWELLY</h2>
          <p>POS & BILLING SYSTEM</p>
        </div>
        <p className="menuHead">MAIN MENU</p>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`navItem ${activeView === item.key || (activeView === "billing" && item.key === "dashboard") ? "active" : ""}`}
              type="button"
              onClick={() => setActiveView(item.key === "dashboard" ? "billing" : item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Welcome back, Admin! 👋</h1>
            <p>Login is always available below. Product lookup reads from your local SQL API list.</p>
          </div>
          <div className="rateControl">
            <label>Gold rate / gram</label>
            <div className="rowInline">
              <input type="number" value={goldRate} onChange={(e) => setGoldRate(Number(e.target.value || 0))} />
              <button onClick={loadTodayRate}>Reload</button>
            </div>
          </div>
        </header>

        <section className="loginStrip panel">
          <div className="loginRow">
            <div>
              <h3>POS Login</h3>
              <p>Required for invoice finalize/print and product CRUD.</p>
            </div>
            <input value={authUser} onChange={(e) => setAuthUser(e.target.value)} placeholder="Username" />
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Password" />
            <button onClick={() => loginLocal()} disabled={authLoading}>{authLoading ? "Logging in..." : "Login"}</button>
            <span className={`pill ${accessToken ? "ok" : "warn"}`}>{accessToken ? "Authenticated" : "Not Logged In"}</span>
          </div>
        </section>

        <section className="statsGrid">
          {stats.map((stat) => (
            <article key={stat.label} className="statCard">
              <p>{stat.label}</p>
              <h3>{stat.value}</h3>
              <span>{stat.hint}</span>
            </article>
          ))}
        </section>

        {error && <p className="error globalError">{error}</p>}

        {activeView === "products" ? (
          <section className="panel productCrudPanel">
            <div className="panelHead">
              <h2>Products Navigation / CRUD</h2>
              <span>Manage products in local SQL DB through API</span>
            </div>
            <div className="crudLayout">
              <div className="productForm">
                <input placeholder="Name" value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} />
                <input placeholder="Category" value={productForm.category} onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))} />
                <input placeholder="Purity (e.g. 22k)" value={productForm.purity} onChange={(e) => setProductForm((p) => ({ ...p, purity: e.target.value }))} />
                <input placeholder="Weight grams" type="number" value={productForm.weight_grams} onChange={(e) => setProductForm((p) => ({ ...p, weight_grams: e.target.value }))} />
                <input placeholder="Making charges" type="number" value={productForm.making_charges} onChange={(e) => setProductForm((p) => ({ ...p, making_charges: e.target.value }))} />
                <input placeholder="Barcode" value={productForm.barcode} onChange={(e) => setProductForm((p) => ({ ...p, barcode: e.target.value }))} />
                <div className="row">
                  <button onClick={saveProduct}>{editingProductId ? "Update Product" : "Create Product"}</button>
                  <button className="secondary" onClick={resetProductForm}>Reset</button>
                  <button onClick={fetchProducts}>Refresh List</button>
                </div>
                {crudMessage && <p className="success">{crudMessage}</p>}
              </div>
              <div>
                <ul className="list productList">
                  {catalogLoading && <li className="empty">Loading products from SQL DB...</li>}
                  {!catalogLoading && catalog.length === 0 && <li className="empty">No products found in local DB.</li>}
                  {catalog.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>{p.name}</strong>
                        <span>{p.category} • {p.purity} • {p.weight_grams}g • {p.barcode}</span>
                      </div>
                      <div className="rowInline">
                        <button className="secondary" onClick={() => startEditProduct(p)}>Edit</button>
                        <button className="danger" onClick={() => deleteProduct(p.id)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : (
          <section className="contentGrid">
            <article className="panel lookupPanel">
              <div className="panelHead">
                <h2>Product Lookup</h2>
                <span>Search local SQL products. Empty query shows full DB catalog.</span>
              </div>

              <div className="row">
                <input
                  placeholder="Search product or scan barcode"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchProducts()}
                />
                <button onClick={searchProducts}>Search</button>
                <button className="secondary" onClick={() => { setQ(""); setResults([]); }}>Show All</button>
              </div>

              <ul className="list">
                {catalogLoading && <li className="empty">Loading products from SQL DB...</li>}
                {!catalogLoading && lookupList.length === 0 && <li className="empty">No products loaded.</li>}
                {lookupList.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <span>{String(p.category || "").toUpperCase()} • {p.purity} • {p.weight_grams}g • {p.barcode}</span>
                    </div>
                    <button onClick={() => dispatch(addItem(p))}>Add</button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel billPanel">
              <div className="panelHead">
                <h2>Bill Preview</h2>
                <span>Live cart summary</span>
              </div>

              <ul className="list">
                {cart.length === 0 && <li className="empty">Your billing cart is empty.</li>}
                {cart.map((item) => {
                  const line = computeLinePrice(item, goldRate);
                  return (
                    <li key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>Qty: {item.quantity} • {formatInr(line.total * item.quantity)}</span>
                      </div>
                      <button className="danger" onClick={() => dispatch(removeItem(item.id))}>Remove</button>
                    </li>
                  );
                })}
              </ul>

              <div className="totalsCard">
                <p><span>Taxable</span><strong>{formatInr(totals.taxable)}</strong></p>
                <p><span>CGST</span><strong>{formatInr(totals.cgst)}</strong></p>
                <p><span>SGST</span><strong>{formatInr(totals.sgst)}</strong></p>
                <p className="grand"><span>Grand Total</span><strong>{formatInr(totals.grand)}</strong></p>
              </div>

              <div className="row">
                <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="split">Split</option>
                </select>
                <button onClick={finalizeInvoice} disabled={isSubmitting || cart.length === 0}>
                  {isSubmitting ? "Finalizing..." : "Finalize Invoice"}
                </button>
                <button className="danger" onClick={() => dispatch(clearCart())}>Clear Bill</button>
              </div>
            </article>

            <article className="panel invoicePanel">
              <div className="panelHead">
                <h2>Invoice Preview</h2>
                <span>Last generated invoice</span>
              </div>

              <div className="invoicePreview">
                <div className="invoiceRow"><span>Invoice No.</span><strong>{invoiceResult?.invoiceNumber || "Pending"}</strong></div>
                <div className="invoiceRow"><span>Date & Time</span><strong>{formatDateTime(invoiceResult?.createdAt || Date.now())}</strong></div>
                <div className="invoiceRow"><span>Payment Mode</span><strong>{paymentMode.toUpperCase()}</strong></div>
                <div className="invoiceRow"><span>Total Amount</span><strong>{formatInr(invoiceResult?.totals?.grand_total || totals.grand)}</strong></div>
                <div className="invoiceRow"><span>Status</span><strong>{invoiceResult ? "Generated" : "Awaiting checkout"}</strong></div>
              </div>

              {invoiceResult ? (
                <div className="actionsCol">
                  <p className="success">
                    Invoice created: <strong>{invoiceResult.invoiceNumber}</strong>
                  </p>
                  <button onClick={() => printInvoice(invoiceResult.invoiceId)}>Print Receipt</button>
                </div>
              ) : (
                <p className="muted">Finalize the current bill to generate invoice data preview.</p>
              )}

              {printStatus && <p className={printStatus.includes("successfully") ? "success" : "error"}>{printStatus}</p>}
            </article>
          </section>
        )}
      </section>
    </div>
  );
}
