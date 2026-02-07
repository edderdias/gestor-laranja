import { Link, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Settings as SettingsIcon, Users, PiggyBank as PiggyBankIcon, Menu } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import React, { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      <a
        ref={ref}
        className={cn(
          "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
          className
        )}
        {...props}
      >
        <div className="text-sm font-medium leading-none">{title}</div>
        <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
          {children}
        </p>
      </a>
    </li>
  );
});
ListItem.displayName = "ListItem";

export function MainLayout() {
  const { signOut, user } = useAuth();
  const isMobile = useIsMobile();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const navLinks = (
    <>
      <NavigationMenuItem>
        <Link 
          to="/accounts-payable" 
          className={cn(navigationMenuTriggerStyle(), "bg-transparent text-white hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white")} 
          onClick={() => isMobile && setIsSheetOpen(false)}
        >
          Contas a Pagar
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link 
          to="/accounts-receivable" 
          className={cn(navigationMenuTriggerStyle(), "bg-transparent text-white hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white")} 
          onClick={() => isMobile && setIsSheetOpen(false)}
        >
          Contas a Receber
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link 
          to="/credit-cards" 
          className={cn(navigationMenuTriggerStyle(), "bg-transparent text-white hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white")} 
          onClick={() => isMobile && setIsSheetOpen(false)}
        >
          Cartões de Crédito
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link 
          to="/piggy-bank" 
          className={cn(navigationMenuTriggerStyle(), "bg-transparent text-white hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white")} 
          onClick={() => isMobile && setIsSheetOpen(false)}
        >
          <PiggyBankIcon className="mr-2 h-4 w-4" /> Cofrinho
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link 
          to="/user-management" 
          className={cn(navigationMenuTriggerStyle(), "bg-transparent text-white hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white")} 
          onClick={() => isMobile && setIsSheetOpen(false)}
        >
          <Users className="mr-2 h-4 w-4" /> Usuários
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link 
          to="/settings" 
          className={cn(navigationMenuTriggerStyle(), "bg-transparent text-white hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white")} 
          onClick={() => isMobile && setIsSheetOpen(false)}
        >
          <SettingsIcon className="mr-2 h-4 w-4" /> Configurações
        </Link>
      </NavigationMenuItem>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-[#2C7F24] text-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {isMobile && (
              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[250px] sm:w-[300px]">
                  <div className="flex flex-col gap-4 pt-8">
                    <Link to="/dashboard" className="flex items-center gap-3 mb-4" onClick={() => setIsSheetOpen(false)}>
                      <div className="p-1">
                        <img src="/logo.png" alt="Método Certo Logo" className="h-[100px] w-[100px] object-contain" />
                      </div>
                      <div>
                        <h1 className="text-xl font-bold">Método Certo</h1>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                      </div>
                    </Link>
                    <NavigationMenu orientation="vertical" className="flex-col items-start">
                      <NavigationMenuList className="flex-col items-start space-y-2">
                        <NavigationMenuItem>
                          <Link to="/accounts-payable" className="block px-4 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsSheetOpen(false)}>Contas a Pagar</Link>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                          <Link to="/accounts-receivable" className="block px-4 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsSheetOpen(false)}>Contas a Receber</Link>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                          <Link to="/credit-cards" className="block px-4 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsSheetOpen(false)}>Cartões de Crédito</Link>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                          <Link to="/piggy-bank" className="flex items-center px-4 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsSheetOpen(false)}><PiggyBankIcon className="mr-2 h-4 w-4" /> Cofrinho</Link>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                          <Link to="/user-management" className="flex items-center px-4 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsSheetOpen(false)}><Users className="mr-2 h-4 w-4" /> Usuários</Link>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                          <Link to="/settings" className="flex items-center px-4 py-2 text-sm font-medium hover:bg-accent rounded-md" onClick={() => setIsSheetOpen(false)}><SettingsIcon className="mr-2 h-4 w-4" /> Configurações</Link>
                        </NavigationMenuItem>
                      </NavigationMenuList>
                    </NavigationMenu>
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="p-1">
                <img src="/logo.png" alt="Método Certo Logo" className="h-[80px] w-[80px] object-contain" />
              </div>
              {!isMobile && (
                <div>
                  <h1 className="text-xl font-bold text-white">Método Certo</h1>
                  <p className="text-sm text-white/80">{user?.email}</p>
                </div>
              )}
            </Link>

            {!isMobile && (
              <NavigationMenu>
                <NavigationMenuList>
                  {navLinks}
                </NavigationMenuList>
              </NavigationMenu>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} className="text-white hover:bg-white/10">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t py-6 bg-background">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Copyright (c) 2026 Eder Dias</p>
          <p className="mt-1">Desenvolvido por Eder Dias</p>
        </div>
      </footer>
    </div>
  );
}