import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function AdminUsersScreen({ children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default AdminUsersScreen

