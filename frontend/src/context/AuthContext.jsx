import { createContext, useContext, useEffect, useState, useCallback } from "react";
import client, { getTokens, setTokens, clearTokens } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { access } = getTokens();
    if (access) {
      client
        .get("/auth/me/")
        .then((r) => {
          setUser(r.data);
          localStorage.setItem("user", JSON.stringify(r.data));
        })
        .catch(() => {
          clearTokens();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await client.post("/auth/login/", { username, password });
    setTokens({ access: data.access, refresh: data.refresh });
    setUser(data.user);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    await client.post("/auth/register/", payload);
    return login(payload.username, payload.password);
  }, [login]);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
