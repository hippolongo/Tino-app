import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function ClerkApprovalsScreen({ children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clerk Claim Approvals</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default ClerkApprovalsScreen

