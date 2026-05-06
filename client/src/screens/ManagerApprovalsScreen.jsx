import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function ManagerApprovalsScreen({ children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Manager Approvals</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default ManagerApprovalsScreen

