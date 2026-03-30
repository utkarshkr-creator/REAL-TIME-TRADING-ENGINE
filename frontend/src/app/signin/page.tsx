"use client";
import { useState } from "react";
import axios from "axios";
import { useAuth } from "../utils/AuthContext";
import { useRouter } from "next/navigation";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const router = useRouter();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/login`, {
        email,
        password, // Note: backend handles hashing, frontend sends plain to HTTPS
      });
      login(res.data.token, res.data.user);
      router.push("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex bg-[#0b0b0b] min-h-screen items-center justify-center p-4 text-white">
      <div className="w-full max-w-md bg-baseBackgroundL2 p-8 rounded-xl border border-baseBorderLight shadow-lg">
        <h2 className="text-2xl font-semibold text-baseTextHighEmphasis mb-6">Log in to Exchange</h2>
        
        {error && (
          <div className="bg-redBackgroundTransparent border border-redBorder text-redText p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col">
            <label className="text-sm text-baseTextMedEmphasis mb-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="bg-[#0b0b0b] border border-baseBorderLight rounded-lg p-3 text-white caret-white focus:border-accentBlue focus:outline-none [&:-webkit-autofill]:shadow-[0_0_0px_1000px_#0b0b0b_inset] [&:-webkit-autofill]:[color:white]"
              placeholder="name@example.com"
            />
          </div>
          
          <div className="flex flex-col">
            <label className="text-sm text-baseTextMedEmphasis mb-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="bg-[#0b0b0b] border border-baseBorderLight rounded-lg p-3 text-white caret-white focus:border-accentBlue focus:outline-none [&:-webkit-autofill]:shadow-[0_0_0px_1000px_#0b0b0b_inset] [&:-webkit-autofill]:[color:white]"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="mt-2 bg-greenPrimaryButtonBackground text-white font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-baseTextMedEmphasis">
          Don&apos;t have an account? <span className="text-accentBlue cursor-pointer hover:underline" onClick={() => router.push('/signup')}>Sign up</span>
        </p>
      </div>
    </div>
  );
}
