import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function ReportsScreen({ children, title = 'Reports' }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default ReportsScreen

