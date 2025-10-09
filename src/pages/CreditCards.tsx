import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function CreditCards() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Cartões de Crédito</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <p className="text-muted-foreground">Em desenvolvimento...</p>
      </main>
    </div>
  );
}
