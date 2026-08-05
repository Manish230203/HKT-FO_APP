import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "../services/api"; // Importing our custom API client

export default function Login() {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  const getPasswordValidationError = (pwd) => {
    if (!pwd) return "";
    if (pwd.length < 8) return "Password must be at least 8 characters long.";
    if (!/[a-zA-Z]/.test(pwd)) return "Password must contain at least one letter.";
    if (!/\d/.test(pwd)) return "Password must contain at least one number.";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return "Password must contain at least one special character.";
    return "";
  };

  const validationError = getPasswordValidationError(password);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    // Validate if identifier is numeric (Mobile Number)
    const isNumeric = /^\d+$/.test(employeeId);
    if (isNumeric) {
      const mobileRegex = /^[6-9]\d{9}$/;
      if (!mobileRegex.test(employeeId)) {
        setErrorMessage("Invalid Mobile Number. Please enter a 10-digit number starting with 6-9.");
        setIsLoading(false);
        return;
      }
    }

    // Verify password validation rules (allowing seeded 'password123' for compatibility)
    if (validationError && password !== "password123") {
      setErrorMessage(validationError);
      setIsLoading(false);
      return;
    }

    try {
      // 1. Call FastAPI backend
      const response = await api.post('/auth/login', {
        identifier: employeeId,
        password: password,
        device_id: "web-dashboard"
      });

      // 2. Save the secure token and user data to sessionStorage
      sessionStorage.setItem('access_token', response.data.access_token);
      sessionStorage.setItem('user', JSON.stringify(response.data.user));

      // 3. Redirect to the main dashboard
      navigate("/");

    } catch (error) {
      console.error("Login Error:", error);
      setErrorMessage(error.response?.data?.detail || "Failed to login. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />

      <Card className="relative w-full max-w-md border-border shadow-lg">
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-md">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">PatrolSync</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to F.O. Portal</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">

            {/* Error Message Display */}
            {errorMessage && (
              <div className="p-3 text-sm text-red-500 bg-red-100 rounded-md border border-red-200 dark:bg-red-950/50 dark:border-red-900/50 dark:text-red-400">
                {errorMessage}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="empId">Employee ID / Mobile Number</Label>
              <Input
                id="empId"
                placeholder="e.g., EMP001 or 9876543210"
                value={employeeId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^\d+$/.test(val) && val.length > 10) return;
                  setEmployeeId(val);
                }}
                className="h-11"
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
                disabled={isLoading}
              />
              {password && validationError && password !== "password123" && (
                <p className="text-xs text-amber-600 font-medium">
                  ⚠️ {validationError}
                </p>
              )}
              {!password && (
                <p className="text-xs text-muted-foreground">
                  Password requirement disabled for testing.
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full h-11 mt-2"
              disabled={isLoading || !employeeId || !password || (!!validationError && password !== "password123")}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Login <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}