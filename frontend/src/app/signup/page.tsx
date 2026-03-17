"use client";
import { useState } from "react";
import axios from "axios";
import { useAuth } from "../utils/AuthContext";
import { useRouter } from "next/navigation";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      // 1. Create the user
      await axios.post("http://localhost:3006/api/v1/auth/signup", {
        email,
        password,
      });
      // 2. Automatically log them in after signup
      const res = await axios.post("http://localhost:3006/api/v1/auth/login", {
        email,
        password,
      });
      login(res.data.token, res.data.user);
      router.push("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex bg-baseBackground min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md bg-baseBackgroundL2 p-8 rounded-xl border border-baseBorderLight shadow-lg">
        <h2 className="text-2xl font-semibold text-baseTextHighEmphasis mb-6">Create an Account</h2>
        
        {error && (
          <div className="bg-redBackgroundTransparent border border-redBorder text-redText p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSignUp} className="flex flex-col gap-4">
          <div className="flex flex-col">
            <label className="text-sm text-baseTextMedEmphasis mb-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="bg-baseBackground border border-baseBorderLight rounded-lg p-3 text-baseTextHighEmphasis focus:border-accentBlue focus:outline-none"
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
              minLength={6}
              className="bg-baseBackground border border-baseBorderLight rounded-lg p-3 text-baseTextHighEmphasis focus:border-accentBlue focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="mt-2 bg-accentBlue text-white font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-baseTextMedEmphasis">
          Already have an account? <span className="text-accentBlue cursor-pointer hover:underline" onClick={() => router.push('/signin')}>Log in</span>
        </p>
      </div>
    </div>
  );
}
