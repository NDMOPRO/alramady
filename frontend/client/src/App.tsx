import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import AdminPanel from "./pages/AdminPanel";
import Profile from "./pages/Profile";

/* Protected route — redirects to /login if not authenticated */
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-3 animate-fade-in-up">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-[13px] text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  
  return <Component />;
}

/* Guest route — redirects to / if already authenticated */
function GuestRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-3 animate-fade-in-up">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-[13px] text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }
  
  if (isAuthenticated) {
    return <Redirect to="/" />;
  }
  
  return <Component />;
}

/* Admin route — requires admin role */
function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, navigate] = useLocation();
  
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-3 animate-fade-in-up">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-[13px] text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  
  // Allow root_admin, admin and editor roles to access admin panel
  if (user?.role !== 'root_admin' && user?.role !== 'admin' && user?.role !== 'editor') {
    return <Redirect to="/" />;
  }
  
  return <Component />;
}
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      {/* Auth pages — guest only */}
      <Route path="/login">{() => <GuestRoute component={Login} />}</Route>
      <Route path="/register">{() => <GuestRoute component={Register} />}</Route>
      <Route path="/forgot-password">{() => <GuestRoute component={ForgotPassword} />}</Route>
      
      {/* Profile — protected */}
      <Route path="/profile">{() => <ProtectedRoute component={Profile} />}</Route>
      
      {/* Admin panel — admin/editor only */}
      <Route path="/admin">{() => <AdminRoute component={AdminPanel} />}</Route>
      
      {/* Main app — protected */}
      <Route path="/">{() => <ProtectedRoute component={Home} />}</Route>
      
      {/* Fallback */}
      <Route>{() => <Redirect to="/" />}</Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
