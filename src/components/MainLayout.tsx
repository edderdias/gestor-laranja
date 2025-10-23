import { Link, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Settings as SettingsIcon, Users, PiggyBank as PiggyBankIcon, Menu } from "lucide-react"; // Importar Menu
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"; // Importar Sheet components
import { cn } from "@/lib/utils";
import React, { useState } from "react"; // Importar useState
import { useIsMobile } from "@/hooks/use-mobile"; // Importar useIsMobile

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      {/* This ListItem is not currently used in MainLayout, but keeping its definition */}
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
  const [isSheetOpen, setIsSheetOpen] = useState(false); // Estado para controlar o Sheet

  const navLinks = (
    <>
      <NavigationMenuItem>
        <Link to="/accounts-payable" className={navigationMenuTriggerStyle()} onClick={() => isMobile && setIsSheetOpen(false)}>
          Contas a Pagar
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link to="/accounts-receivable" className={navigationMenuTriggerStyle()} onClick={() => isMobile && setIsSheetOpen(false)}>
          Contas a Receber
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link to="/credit-cards" className={navigationMenuTriggerStyle()} onClick={() => isMobile && setIsSheetOpen(false)}>
          Cartões de Crédito
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link to="/piggy-bank" className={navigationMenuTriggerStyle()} onClick={() => isMobile && setIsSheetOpen(false)}>
          <PiggyBankIcon className="mr-2 h-4 w-4" /> Cofrinho
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link to="/user-management" className={navigationMenuTriggerStyle()} onClick={() => isMobile && setIsSheetOpen(false)}>
          <Users className="mr-2 h-4 w-4" /> Usuários
        </Link>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <Link to="/settings" className={navigationMenuTriggerStyle()} onClick={() => isMobile && setIsSheetOpen(false)}>
          <SettingsIcon className="mr-2 h-4 w-4" /> Configurações
        </Link>
      </NavigationMenuItem>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {isMobile && (
              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[250px] sm:w-[300px]">
                  <div className="flex flex-col gap-4 pt-8">
                    <Link to="/dashboard" className="flex items-center gap-3 mb-4" onClick={() => setIsSheetOpen(false)}>
                      <div className="p-1">
                        <img src="/logo.png" alt="Bússola Financeira Logo" className="h-10 w-10" />
                      </div>
                      <div>
                        <h1 className="text-xl font-bold">Bússola Financeira</h1>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                      </div>
                    </Link>
                    <NavigationMenu orientation="vertical" className="flex-col items-start">
                      <NavigationMenuList className="flex-col items-start space-y-2">
                        {navLinks}
                      </NavigationMenuList>
                    </NavigationMenu>
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="p-1">
                <img src="/logo.png" alt="Bússola Financeira Logo" className="h-10 w-10" />
              </div>
              {!isMobile && ( // Esconder o texto do título no mobile quando o menu lateral está presente
                <div>
                  <h1 className="text-xl font-bold">Bússola Financeira</h1>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
              )}
            </Link>

            {/* Navigation Menu for Desktop */}
            {!isMobile && (
              <NavigationMenu>
                <NavigationMenuList>
                  {navLinks}
                </NavigationMenuList>
              </NavigationMenu>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}