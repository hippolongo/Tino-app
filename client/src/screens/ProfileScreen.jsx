import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function ProfileScreen({ children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Profile</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default ProfileScreen

