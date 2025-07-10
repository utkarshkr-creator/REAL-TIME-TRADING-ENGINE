"use client"
import { usePathname, useRouter } from "next/navigation";


export default function AppBar() {
  const route = usePathname();
  const router = useRouter();

  return (
    <div className="z-20 w-full bg-baseBackgroundL2 opacity-85 text-white">
      <div className="flex h-24 w-full flex-col justify-center pl-[21px] pr-4">
        <div className="flex justify-between">
          <div className="flex items-center">
            <div className="ml-[20px] mr-[20px] text-3xl font-bold flex flex-row items-center justify-center cursor-pointer" onClick={() => router.push('/')}>Exchange</div>
            <div className={`ml-[20px] mr-[20px] flex flex-row items-center justify-center cursor-pointer ${route.startsWith('/markets') ? 'text-white' : 'text-slate-500'}`} onClick={() => router.push('/markets')}>Markets</div>
            <div className={`ml-[20px] mr-[20px] flex flex-row items-center justify-center cursor-pointer ${route.startsWith('/trade') ? 'text-white' : 'text-slate-500'}`} onClick={() => router.push('/trade/TATA_INR')}>Trade</div>
          </div>
          <div className="flex">
            <div><button className="my-auto ml-10 text-nowrap rounded-lg bg-greenPrimaryButtonBackground/[16%] px-3 py-1.5 text-sm font-semibold text-greenPrimaryButtonBackground hover:opacity-90">sign in</button></div>
            <div><button className="my-auto ml-10 text-nowrap rounded-lg bg-accentBlue/[16%] px-3 py-1.5 text-sm font-semibold text-accentBlue hover:opacity-90">sign up</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}
