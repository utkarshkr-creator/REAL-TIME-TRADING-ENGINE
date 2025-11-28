"use client";
import { Depth } from "@/app/components/depth/Depth";
import { MarketBar } from "@/app/components/MarketBar";
import { SwapUI } from "@/app/components/SwapUI";
import { TradeView } from "@/app/components/TradeView";
import { useParams } from "next/navigation";

export default function TradeMarket() {
  const { market } = useParams();
  return (
    <div className="flex flex-1">
      <div className="flex flex-col flex-1">
        <MarketBar market={market as string} />
        <div className="flex flex-row flex-1 border-y border-slate-800 min-h-0">
          <div className="flex flex-col flex-1 overflow-hidden min-w-0">
            <TradeView market={market as string} />
          </div>
          <div className="flex flex-col w-[250px] shrink-0 overflow-hidden">
            <Depth market={market as string} />
          </div>
        </div>
      </div>
      <div className="w-[10px] flex-col border-slate-800 border-l"></div>
      <div>
        <div className="flex flex-col w-[250px] shrink-0">
          <SwapUI market={market as string} />
        </div>
      </div>
    </div>
  );
}
