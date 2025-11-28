"use client"
import { usePathname, useRouter } from "next/navigation";


export default function AppBar() {
  const route = usePathname();
  const router = useRouter();

  return (
    <div className="z-20 w-full bg-baseBackgroundL2 opacity-85 text-white">
      <div className="flex h-24 w-full flex-col justify-center pl-[21px] pr-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-10 pl-4">
            <div className="text-3xl font-bold cursor-pointer" onClick={() => router.push('/')}>Exchange</div>
            <div className={`cursor-pointer ${route.startsWith('/markets') ? 'text-white' : 'text-slate-500'}`} onClick={() => router.push('/markets')}>Markets</div>
            <div className={`cursor-pointer ${route.startsWith('/trade') ? 'text-white' : 'text-slate-500'}`} onClick={() => router.push('/trade/TATA_INR')}>Trade</div>
          </div>
          <div className="flex gap-4">
            <button className="text-nowrap rounded-lg bg-greenPrimaryButtonBackground/[16%] px-3 py-1.5 text-sm font-semibold text-greenPrimaryButtonBackground hover:opacity-90">sign in</button>
            <button className="text-nowrap rounded-lg bg-accentBlue/[16%] px-3 py-1.5 text-sm font-semibold text-accentBlue hover:opacity-90">sign up</button>
          </div>
        </div>
      </div>
    </div>
  );
}
