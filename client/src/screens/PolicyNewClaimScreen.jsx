import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function PolicyNewClaimScreen({ children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit New Claim</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default PolicyNewClaimScreen

