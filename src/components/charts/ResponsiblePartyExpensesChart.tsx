import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS } from '@/lib/chart-colors';

interface ResponsiblePartyExpenseData {
  name: string;
  total: number;
}

interface ResponsiblePartyExpensesChartProps {
  data: ResponsiblePartyExpenseData[];
}

export function ResponsiblePartyExpensesChart({ data }: ResponsiblePartyExpensesChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por Responsável</CardTitle>
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
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `R$ ${value.toFixed(2)}`} />
            <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
            <Legend />
            <Bar dataKey="total" name="Total Gasto" fill={CHART_COLORS[0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}