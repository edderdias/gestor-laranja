import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS } from '@/lib/chart-colors';

interface ResponsiblePersonExpenseData {
  name: string;
  value: number;
}

interface ResponsiblePersonExpensesChartProps {
  data: ResponsiblePersonExpenseData[];
}

export function ResponsiblePersonExpensesChart({ data }: ResponsiblePersonExpensesChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por Responsável (Mês)</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
              >
                {data.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nenhum gasto por responsável neste mês.
          </div>
        )}
      </CardContent>
    </Card>
  );
}