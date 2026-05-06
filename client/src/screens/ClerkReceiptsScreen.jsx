import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function ClerkReceiptsScreen({ children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Received Caskets</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default ClerkReceiptsScreen

