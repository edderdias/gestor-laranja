import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS } from '@/lib/chart-colors';

interface MonthlyIncomeData {
  month: string;
  total: number;
}

interface MonthlyIncomeChartProps {
  data: MonthlyIncomeData[];
}

export function MonthlyIncomeChart({ data }: MonthlyIncomeChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ganhos Mensais</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
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
              <Bar dataKey="total" name="Total Recebido" fill={CHART_COLORS[1]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nenhum ganho registrado nos últimos meses.
          </div>
        )}
      </CardContent>
    </Card>
  );
}