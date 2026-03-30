"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../utils/AuthContext";
import { useRouter } from "next/navigation";
import AppBar from "../components/AppBar";

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"orders" | "trades">("orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        if (activeTab === "orders") {
          const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/account/orders`);
          setOrders(res.data || []);
        } else {
          const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/account/trades`);
          setTrades(res.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch history:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [user, activeTab]);

  if (authLoading || !user) {
    return <div className="h-screen flex items-center justify-center bg-baseBackground text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-baseBackground flex flex-col">
      <AppBar />
      <div className="flex-1 max-w-5xl mx-auto w-full p-6 mt-8">
        <h1 className="text-3xl font-bold text-baseTextHighEmphasis mb-8">Account History</h1>

        <div className="flex gap-4 mb-6 border-b border-baseBorderLight">
          <button 
            className={`pb-3 px-4 font-semibold text-sm transition-colors ${activeTab === "orders" ? "text-accentBlue border-b-2 border-accentBlue" : "text-baseTextMedEmphasis hover:text-baseTextHighEmphasis"}`}
            onClick={() => setActiveTab("orders")}
          >
            My Orders
          </button>
          <button 
            className={`pb-3 px-4 font-semibold text-sm transition-colors ${activeTab === "trades" ? "text-accentBlue border-b-2 border-accentBlue" : "text-baseTextMedEmphasis hover:text-baseTextHighEmphasis"}`}
            onClick={() => setActiveTab("trades")}
          >
            Trade Executions
          </button>
        </div>

        <div className="bg-baseBackgroundL2 rounded-xl border border-baseBorderLight overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center text-baseTextMedEmphasis">Loading {activeTab}...</div>
          ) : activeTab === "orders" ? (
            <table className="w-full text-left">
              <thead className="text-xs text-baseTextMedEmphasis border-b border-baseBorderLight">
                <tr>
                  <th className="font-normal py-4 px-6">Date</th>
                  <th className="font-normal py-4 px-6">Market</th>
                  <th className="font-normal py-4 px-6">Side</th>
                  <th className="font-normal py-4 px-6 text-right">Price</th>
                  <th className="font-normal py-4 px-6 text-right">Qty</th>
                  <th className="font-normal py-4 px-6 text-right">Executed</th>
                  <th className="font-normal py-4 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {orders.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-baseTextMedEmphasis">No orders found.</td></tr>
                ) : (
                  orders.map(o => (
                    <tr key={o.order_id} className="border-b border-baseBorderLight last:border-0 hover:bg-baseBackgroundL3 transition-colors">
                      <td className="py-4 px-6 text-baseTextHighEmphasis">{new Date(o.created_at).toLocaleString()}</td>
                      <td className="py-4 px-6 font-medium text-baseTextHighEmphasis">{o.market}</td>
                      <td className={`py-4 px-6 font-semibold ${o.side === 'buy' ? 'text-greenText' : 'text-redText'}`}>{o.side.toUpperCase()}</td>
                      <td className="py-4 px-6 text-right text-baseTextHighEmphasis">{Number(o.price).toLocaleString()}</td>
                      <td className="py-4 px-6 text-right text-baseTextHighEmphasis">{Number(o.quantity).toLocaleString()}</td>
                      <td className="py-4 px-6 text-right text-baseTextHighEmphasis">{Number(o.executed_qty).toLocaleString()}</td>
                      <td className="py-4 px-6 text-right text-baseTextMedEmphasis capitalize">{o.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left">
              <thead className="text-xs text-baseTextMedEmphasis border-b border-baseBorderLight">
                <tr>
                  <th className="font-normal py-4 px-6">Date</th>
                  <th className="font-normal py-4 px-6">Market</th>
                  <th className="font-normal py-4 px-6">Action</th>
                  <th className="font-normal py-4 px-6 text-right">Price</th>
                  <th className="font-normal py-4 px-6 text-right">Quantity</th>
                  <th className="font-normal py-4 px-6 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {trades.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-baseTextMedEmphasis">No trades found.</td></tr>
                ) : (
                  trades.map((t, idx) => (
                    <tr key={idx} className="border-b border-baseBorderLight last:border-0 hover:bg-baseBackgroundL3 transition-colors">
                      <td className="py-4 px-6 text-baseTextHighEmphasis">{new Date(t.time).toLocaleString()}</td>
                      <td className="py-4 px-6 font-medium text-baseTextHighEmphasis">{t.currency_code}</td>
                      <td className={`py-4 px-6 font-semibold ${t.side === 'buy' ? 'text-greenText' : 'text-redText'}`}>{t.side.toUpperCase()}</td>
                      <td className="py-4 px-6 text-right text-baseTextHighEmphasis">{Number(t.price).toLocaleString()}</td>
                      <td className="py-4 px-6 text-right text-baseTextHighEmphasis">{Number(t.volume).toLocaleString()}</td>
                      <td className="py-4 px-6 text-right text-baseTextHighEmphasis">{(Number(t.price) * Number(t.volume)).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
