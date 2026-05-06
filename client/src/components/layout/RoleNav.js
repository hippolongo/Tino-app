import {
  Home,
  UserCircle2,
  Users,
  FileText,
  FilePlus2,
  ClipboardCheck,
  PackagePlus,
  BarChart3,
  ShieldCheck,
} from 'lucide-react'

export function getNavItemsByRole(role) {
  const shared = [{ id: 'overview', label: 'Overview', icon: Home }, { id: 'profile', label: 'Profile', icon: UserCircle2 }]
  if (role === 'System Administrator') return [...shared, { id: 'users', label: 'Users', icon: Users }]
  if (role === 'Policy Holder')
    return [...shared, { id: 'my-claims', label: 'My Claims', icon: FileText }, { id: 'new-claim', label: 'Submit Claim', icon: FilePlus2 }]
  if (role === 'Stores Clerk')
    return [...shared, { id: 'clerk-claims', label: 'Claim Approvals', icon: ClipboardCheck }, { id: 'clerk-receipts', label: 'Stock Receipts', icon: PackagePlus }, { id: 'stock-reports', label: 'Stock Reports', icon: BarChart3 }]
  if (role === 'Branch Manager')
    return [...shared, { id: 'manager-claims', label: 'Manager Approvals', icon: ShieldCheck }, { id: 'stock-reports', label: 'Stock Reports', icon: BarChart3 }]
  if (role === 'General Manager') return [...shared, { id: 'gm-reports', label: 'GM Reports', icon: BarChart3 }]
  return [...shared, { id: 'receive', label: 'Receive Stock', icon: PackagePlus }, { id: 'dispatch', label: 'Dispatch/Issue', icon: FileText }]
}

