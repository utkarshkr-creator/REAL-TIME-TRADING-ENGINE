"use client";

import { useEffect, useState } from "react";
import {
  getDepth,
  getTicker,
  getTrades,
} from "../../utils/httpClient";
import { BidTable } from "./BidTable";
import { AskTable } from "./AskTable";
import { Trades } from "./Trades";
import { SignalingManager } from "../../utils/SignalingManager";

const DECIMAL_PRECISION = parseInt(process.env.NEXT_PUBLIC_DECIMAL_PRECISION || '6', 10);
const SCALING_FACTOR = Math.pow(10, DECIMAL_PRECISION);

export function Depth({ market }: { market: string }) {
  const [bids, setBids] = useState<[string, string][]>([]);
  const [asks, setAsks] = useState<[string, string][]>([]);
  const [price, setPrice] = useState<string>();
  const [activeTab, setActiveTab] = useState<"book" | "trades">("book");
  const [grouping, setGrouping] = useState(0.01);

  useEffect(() => {
    SignalingManager.getInstance().registerCallback(
      `depth@${market}`,
      (data: any) => {
        setBids((originalBids) => {
          const bidMap = new Map(originalBids || []);

          (data.bids || []).forEach(
            ([price, quantity]: [price: string, quantity: string]) => {
              const scaledPrice = (Number(price) / SCALING_FACTOR).toString();
              const scaledQuantity = (Number(quantity) / SCALING_FACTOR).toString();
              if (Number(scaledQuantity) === 0) {
                bidMap.delete(scaledPrice);
              } else {
                bidMap.set(scaledPrice, scaledQuantity);
              }
            }
          );
          const sortedBids = Array.from(bidMap).sort(
            (a, b) => Number(a[0]) - Number(b[0])
          );
          return sortedBids;
        });

        setAsks((originalAsks) => {
          const askMap = new Map(originalAsks || []);

          (data.asks || []).forEach(
            ([price, quantity]: [price: string, quantity: string]) => {
              const scaledPrice = (Number(price) / SCALING_FACTOR).toString();
              const scaledQuantity = (Number(quantity) / SCALING_FACTOR).toString();
              if (Number(scaledQuantity) === 0) {
                askMap.delete(scaledPrice);
              } else {
                askMap.set(scaledPrice, scaledQuantity);
              }
            }
          );
          const sortedAsks = Array.from(askMap).sort(
            (a, b) => Number(b[0]) - Number(a[0])
          );
          return sortedAsks;
        });
      },
      `DEPTH-${market}`
    );

    SignalingManager.getInstance().registerCallback(
      `ticker@${market}`,
      (data: any) => {
        setPrice((Number(data.lastPrice) / SCALING_FACTOR).toString());
      },
      `DEPTH-TICKER-${market}`
    );

    getDepth(market).then((d) => {
      setBids(d.bids ?? []);
      setAsks((d.asks ?? []).reverse());
    });

    getTicker(market).then((t) => setPrice(t.lastPrice));
    getTrades(market).then((t) => {
      if (t && t.length > 0) {
        setPrice(t[0].price);
      }
    });

    return () => {
      SignalingManager.getInstance().deRegisterCallback(
        `depth@${market}`,
        `DEPTH-${market}`
      );
      SignalingManager.getInstance().deRegisterCallback(
        `ticker@${market}`,
        `DEPTH-TICKER-${market}`
      );
    };
  }, [market]);

  const highestBid = bids.length > 0 ? Number(bids[bids.length - 1][0]) : 0;
  const lowestAsk = asks.length > 0 ? Number(asks[asks.length - 1][0]) : 0;
  const spread = lowestAsk - highestBid;
  const spreadPercent = highestBid > 0 ? (spread / highestBid) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-baseBackgroundL1">
      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab("book")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "book"
              ? "text-white border-b-2 border-accentBlue"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Book
        </button>
        <button
          onClick={() => setActiveTab("trades")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "trades"
              ? "text-white border-b-2 border-accentBlue"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Trades
        </button>
      </div>

      {/* Grouping Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGrouping(Math.max(0.01, grouping - 0.01))}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          >
            −
          </button>
          <span className="text-xs text-slate-400 min-w-[40px] text-center">
            {grouping.toFixed(2)}
          </span>
          <button
            onClick={() => setGrouping(grouping + 0.01)}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {activeTab === "book" ? (
        <>
          {/* Table Header */}
          <div className="flex justify-between px-4 py-2 text-xs font-semibold text-slate-400 bg-[#0B0E14] border-y border-baseBorder">
            <div>Price (INR)</div>
            <div className="text-right">Size (TATA)</div>
            <div className="text-right">Total (TATA)</div>
          </div>

          {/* Order Book */}
          <div className="flex-1 overflow-y-auto">
            {asks && <AskTable asks={asks} />}
            
            {/* Spread Indicator */}
            {price && (
              <div className="px-3 py-2 border-y border-slate-800 bg-slate-900/50">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold text-white">
                    {Number(price).toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-500">
                    ↔ {spread.toFixed(2)} ({spreadPercent.toFixed(2)}%)
                  </div>
                </div>
              </div>
            )}
            
            {bids && <BidTable bids={bids} />}
          </div>

          {/* Bottom Percentage Indicator */}
          <div className="px-3 py-2 border-t border-slate-800">
            <div className="text-center text-sm text-red-500 font-medium">
              -3.61%
            </div>
          </div>
        </>
      ) : (
        <Trades market={market} />
      )}
    </div>
  );
}
