"use client";

import { useEffect, useState } from "react";
import { getTrades } from "../../utils/httpClient";
import { Trade } from "../../utils/types";
import { SignalingManager } from "../../utils/SignalingManager";

const DECIMAL_PRECISION = parseInt(process.env.NEXT_PUBLIC_DECIMAL_PRECISION || '6', 10);
const SCALING_FACTOR = Math.pow(10, DECIMAL_PRECISION);

export function Trades({ market }: { market: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    getTrades(market).then((initialTrades) => {
      if (initialTrades) {
        setTrades(initialTrades.slice(0, 20));
      }
    });

    // Subscribe to live trade updates
    SignalingManager.getInstance().registerCallback(
      `trade@${market}`,
      (newTrade: Trade) => {
        console.log("WebSocket trade received:", JSON.stringify(newTrade, null, 2));
        const quantityRaw = newTrade.quantity || (newTrade as any).qty || "0";
        const scaledTrade = {
            ...newTrade,
            price: (Number(newTrade.price) / SCALING_FACTOR).toString(),
            quantity: (Number(quantityRaw) / SCALING_FACTOR).toString()
        };
        setTrades((prevTrades) => {
          const updatedTrades = [scaledTrade, ...prevTrades];
          return updatedTrades.slice(0, 20);
        });
      },
      `TRADES-${market}`
    );

    return () => {
      SignalingManager.getInstance().deRegisterCallback(
        `trade@${market}`,
        `TRADES-${market}`
      );
    };
  }, [market]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  return (
    <div className="flex flex-col h-full bg-baseBackgroundL1">
      {/* Table Header */}
      <div className="flex justify-between px-4 py-2 text-xs font-semibold text-slate-400 bg-[#0B0E14] border-b border-baseBorder">
        <div className="text-left">Price (INR)</div>
        <div className="text-right">Size (TATA)</div>
        <div className="text-right">Time</div>
      </div>

      {/* Trades List */}
      <div className="flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            No trades yet
          </div>
        ) : (
          trades.map((trade, index) => (
            <div
              key={index}
              className="flex justify-between px-3 py-1 text-xs hover:bg-slate-800/30 cursor-pointer"
            >
              <div
                className={`font-medium ${
                  !trade.isBuyerMaker ? "text-green-500" : "text-red-500"
                }`}
              >
                {Number(trade.price).toFixed(2)}
              </div>
              <div className="text-slate-300">
                {Number(trade.quantity).toFixed(4)}
              </div>
              <div className="text-slate-500">{formatTime(trade.timestamp)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
