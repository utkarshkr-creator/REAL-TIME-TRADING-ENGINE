"use client";

import { useEffect, useState } from "react";
import {
  getDepth,
  getKlines,
  getTicker,
  getTrades,
} from "../../utils/httpClient";
import { BidTable } from "./BidTable";
import { AskTable } from "./AskTable";
import { SignalingManager } from "../../utils/SignalingManager";

export function Depth({ market }: { market: string }) {
  const [bids, setBids] = useState<[string, string][]>([]);
  const [asks, setAsks] = useState<[string, string][]>([]);
  const [price, setPrice] = useState<string>();

  useEffect(() => {
    SignalingManager.getInstance().registerCallback(
      "depth",
      (data: any) => {
        console.log("depth has been updated");
        console.log(data);

        setBids((originalBids) => {
          const bidMap = new Map(originalBids || []);

          data.bids.forEach(
            ([price, quantity]: [price: string, quantity: string]) => {
              if (Number(quantity) === 0) {
                bidMap.delete(price);
              } else {
                bidMap.set(price, quantity);
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

          data.asks.forEach(
            ([price, quantity]: [price: string, quantity: string]) => {
              if (Number(quantity) === 0) {
                askMap.delete(price);
              } else {
                askMap.set(price, quantity);
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

    SignalingManager.getInstance().sendMessage({
      method: "SUBSCRIBE",
      params: [`depth@${market}`],
    });

    getDepth(market).then((d) => {
      setBids(d.bids);
      setAsks(d.asks.reverse());
    });

    getTicker(market).then((t) => setPrice(t.lastPrice));
    getTrades(market).then((t) => setPrice(t[0].price));

    return () => {
      SignalingManager.getInstance().sendMessage({
        method: "UNSUBSCRIBE",
        params: [`depth@${market}`],
      });
      SignalingManager.getInstance().deRegisterCallback(
        "depth",
        `DEPTH-${market}`
      );
    };
  }, []);

  return (
    <div>
      <TableHeader />
      {asks && <AskTable asks={asks} />}
      {price && <div>{price}</div>}
      {bids && <BidTable bids={bids} />}
    </div>
  );
}

function TableHeader() {
  return (
    <div className="flex justify-between text-xs">
      <div className="text-white">Price</div>
      <div className="text-slate-500">Size</div>
      <div className="text-slate-500">Total</div>
    </div>
  );
}
