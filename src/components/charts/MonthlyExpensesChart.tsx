import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS } from '@/lib/chart-colors';

interface MonthlyExpenseData {
  month: string;
  total: number;
}

interface MonthlyExpensesChartProps {
  data: MonthlyExpenseData[];
}

export function MonthlyExpensesChart({ data }: MonthlyExpensesChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos Mensais</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => `R$ ${value.toFixed(2)}`} />
            <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
            <Legend />
            <Bar dataKey="total" name="Total Gasto" fill={CHART_COLORS[2]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}