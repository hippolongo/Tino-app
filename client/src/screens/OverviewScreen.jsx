import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function OverviewScreen({ children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default OverviewScreen

