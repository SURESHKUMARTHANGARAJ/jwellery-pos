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

  return (
    <div className="layout">
      <header className="header">
        <h1>Jewellery GST POS</h1>
        <div className="rateBox">
          <label>Gold rate / gram</label>
          <input type="number" value={goldRate} onChange={(e) => setGoldRate(Number(e.target.value || 0))} />
          <button onClick={loadTodayRate}>Reload Today Rate</button>
        </div>
      </header>

      <main className="main">
        <section className="panel">
          <h2>Product Lookup</h2>
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
            {results.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <span>{p.category.toUpperCase()} | {p.purity} | {p.weight_grams}g</span>
                </div>
                <button onClick={() => dispatch(addItem(p))}>Add</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Current Bill</h2>
          <ul className="list">
            {cart.map((item) => {
              const line = computeLinePrice(item, goldRate);
              return (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>Qty: {item.quantity} | {formatInr(line.total * item.quantity)}</span>
                  </div>
                  <button className="danger" onClick={() => dispatch(removeItem(item.id))}>Remove</button>
                </li>
              );
            })}
          </ul>
          <div className="totals">
            <p>Taxable: {formatInr(totals.taxable)}</p>
            <p>CGST: {formatInr(totals.cgst)}</p>
            <p>SGST: {formatInr(totals.sgst)}</p>
            <p className="grand">Grand Total: {formatInr(totals.grand)}</p>
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
          {invoiceResult && (
            <>
              <p className="success">
                Invoice created: <strong>{invoiceResult.invoiceNumber}</strong> ({formatInr(invoiceResult?.totals?.grand_total)})
              </p>
              <button onClick={() => printInvoice(invoiceResult.invoiceId)}>Print Receipt</button>
              {printStatus && <p className={printStatus.includes("successfully") ? "success" : "error"}>{printStatus}</p>}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
