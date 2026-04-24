import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { addItem, clearCart, removeItem } from "./store/slices/billingSlice.js";
import { computeLinePrice } from "./lib/pricing.js";

const API_BASE = "http://localhost:4200";

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

export default function App() {
  const dispatch = useDispatch();
  const cart = useSelector((state) => state.billing.cart);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [goldRate, setGoldRate] = useState(6500);
  const [error, setError] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [invoiceResult, setInvoiceResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [printStatus, setPrintStatus] = useState("");
  const [accessToken, setAccessToken] = useState("");

  useEffect(() => {
    loginLocal();
    loadTodayRate();
  }, []);

  async function loginLocal() {
    try {
      const { data } = await axios.post(`${API_BASE}/api/auth/login`, {
        username: "admin",
        password: "admin123"
      });
      setAccessToken(data?.data?.access_token || "");
    } catch {
      setError("Login failed for local API.");
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
          dispatch(addItem(data.data));
          setResults([data.data]);
          setQ("");
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

  async function finalizeInvoice() {
    try {
      if (!cart.length) return;
      if (!accessToken) throw new Error("POS not authenticated yet.");
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
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setInvoiceResult(data?.data || null);
      setPrintStatus("");
      dispatch(clearCart());
      setResults([]);
      setQ("");
    } catch (e) {
      setError(e?.response?.data?.message || "Invoice finalization failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function printInvoice(invoiceId) {
    try {
      if (!accessToken) throw new Error("POS not authenticated yet.");
      setPrintStatus("");
      await axios.post(`${API_BASE}/api/print/invoice/${invoiceId}`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setPrintStatus("Invoice printed successfully.");
    } catch (e) {
      setPrintStatus(e?.response?.data?.message || "Printer unavailable. Please check thermal printer.");
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
    { label: "Search Results", value: results.length, hint: "Products found" },
    { label: "Gold Rate (24K)", value: `${formatInr(goldRate)}/gm`, hint: "Live/manual rate" }
  ];

  return (
    <div className="appShell">
      <aside className="sideNav">
        <div className="brand">
          <h2>JEWELLY</h2>
          <p>POS & BILLING SYSTEM</p>
        </div>
        <p className="menuHead">MAIN MENU</p>
        <nav>
          {[
            "Dashboard",
            "Billing (POS)",
            "Products",
            "Customers",
            "Inventory",
            "Gold Rates",
            "Reports",
            "Expenses",
            "Users",
            "Settings"
          ].map((item, idx) => (
            <button key={item} className={`navItem ${idx === 0 ? "active" : ""}`} type="button">{item}</button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Welcome back, Admin! 👋</h1>
            <p>Here&apos;s what&apos;s happening with your jewellery billing desk today.</p>
          </div>
          <div className="topbarActions">
            <div className="rateControl">
              <label>Gold rate / gram</label>
              <div className="rowInline">
                <input type="number" value={goldRate} onChange={(e) => setGoldRate(Number(e.target.value || 0))} />
                <button onClick={loadTodayRate}>Reload</button>
              </div>
            </div>
          </div>
        </header>

        <section className="statsGrid">
          {stats.map((stat) => (
            <article key={stat.label} className="statCard">
              <p>{stat.label}</p>
              <h3>{stat.value}</h3>
              <span>{stat.hint}</span>
            </article>
          ))}
        </section>

        <section className="contentGrid">
          <article className="panel lookupPanel">
            <div className="panelHead">
              <h2>Product Lookup</h2>
              <span>Scan barcode or search by name</span>
            </div>

            <div className="row">
              <input
                placeholder="Search product or scan barcode"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchProducts()}
              />
              <button onClick={searchProducts}>Search</button>
            </div>

            {error && <p className="error">{error}</p>}

            <ul className="list">
              {results.length === 0 && <li className="empty">No products loaded.</li>}
              {results.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <span>{p.category.toUpperCase()} • {p.purity} • {p.weight_grams}g • {p.barcode}</span>
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
      </section>
    </div>
  );
}
