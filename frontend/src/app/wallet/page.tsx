"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../utils/AuthContext";
import { useRouter } from "next/navigation";
import AppBar from "../components/AppBar";

interface Balance {
  currency: string;
  available: string;
  locked: string;
}

export default function WalletPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [balances, setBalances] = useState<Balance[]>([]);
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const fetchBalances = async () => {
    try {
      const res = await axios.get("http://localhost:3006/api/v1/wallet/balances");
      setBalances(res.data.balances || []);
    } catch (err) {
      console.error("Failed to fetch balances:", err);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/signin");
      } else {
        fetchBalances();
      }
    }
  }, [user, authLoading, router]);

  const handleDeposit = async () => {
    if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
      setErrorMsg("Please enter a valid amount");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
      return;
    }

    setStatus("loading");
    setErrorMsg("");
    try {
      await axios.post("http://localhost:3006/api/v1/wallet/deposit", {
        currency: "INR", // Hardcoded mock deposit to INR for now
        amount: Number(depositAmount)
      });
      setStatus("success");
      setDepositAmount("");
      await fetchBalances(); // Refresh balances
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.response?.data?.error || "Deposit failed");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  if (authLoading || !user) {
    return <div className="h-screen flex items-center justify-center bg-baseBackground text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-baseBackground flex flex-col">
      <AppBar />
      <div className="flex-1 max-w-4xl mx-auto w-full p-6 mt-8">
        <h1 className="text-3xl font-bold text-baseTextHighEmphasis mb-8">My Wallet</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Balances Section */}
          <div className="bg-baseBackgroundL2 rounded-xl p-6 border border-baseBorderLight">
            <h2 className="text-xl font-semibold text-baseTextHighEmphasis mb-6">Balances</h2>
            
            {balances.length === 0 ? (
              <p className="text-baseTextMedEmphasis text-sm">No funds found. Try depositing!</p>
            ) : (
              <div className="space-y-4">
                {balances.map((b) => (
                  <div key={b.currency} className="flex justify-between items-center bg-baseBackground p-4 rounded-lg border border-baseBorderLight">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-baseBackgroundL3 flex items-center justify-center font-bold text-accentBlue">
                        {b.currency.charAt(0)}
                      </div>
                      <span className="font-semibold text-baseTextHighEmphasis">{b.currency}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-baseTextHighEmphasis">{Number(b.available).toFixed(2)}</p>
                      <p className="text-xs text-baseTextMedEmphasis">Locked: {Number(b.locked).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Deposit Section */}
          <div className="bg-baseBackgroundL2 rounded-xl p-6 border border-baseBorderLight h-fit">
            <h2 className="text-xl font-semibold text-baseTextHighEmphasis mb-6">Deposit Mock Funds (INR)</h2>
            
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-baseTextMedEmphasis">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-baseTextMedEmphasis">₹</span>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="10000"
                    className="w-full bg-baseBackground border border-baseBorderLight rounded-lg p-3 pl-8 text-baseTextHighEmphasis focus:border-accentBlue focus:outline-none transition-colors"
                  />
                </div>
                {status === "error" && <p className="text-redText text-xs mt-1">{errorMsg}</p>}
              </div>

              <button
                onClick={handleDeposit}
                disabled={status === "loading" || !depositAmount}
                className={`mt-2 font-semibold text-center h-12 rounded-lg text-base px-4 py-2 transition-colors ${
                  status === "loading"
                    ? "opacity-60 cursor-not-allowed bg-greenPrimaryButtonBackground text-white"
                    : status === "success"
                    ? "bg-green-600 text-white"
                    : "bg-accentBlue text-white hover:opacity-90 active:scale-95"
                }`}
              >
                {status === "loading" ? "Processing..." : status === "success" ? "✓ Deposited" : "Deposit Funds"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
