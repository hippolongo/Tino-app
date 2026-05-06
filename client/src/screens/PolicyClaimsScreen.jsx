import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function PolicyClaimsScreen({ children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Claims</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default PolicyClaimsScreen

