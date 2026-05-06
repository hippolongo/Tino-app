const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')

dotenv.config()

const app = express()

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

const STOCK_EDIT_ROLES = new Set([
  'General Manager',
  'Stores Clerk',
  'Branch Manager',
])
const CLAIM_MANAGER_ROLES = new Set(['Branch Manager'])
const REPORT_ROLES = new Set(['General Manager', 'Branch Manager', 'Stores Clerk', 'System Administrator'])
const POLICY_NUMBER_REGEX = /^D\d{5}[A-Z]$/
const ADMIN_ROLE = 'System Administrator'

app.use(
  cors({
    origin: IS_PRODUCTION ? true : CORS_ORIGIN,
    credentials: true,
  }),
)
app.use(express.json())

// In production we serve the built React app from Server/public.
if (IS_PRODUCTION) {
  const publicDir = path.join(__dirname, 'public')
  app.use(express.static(publicDir))
}

const validateSupabase = (res) => {
  if (!supabaseAdmin) {
    res.status(500).json({
      error: 'Supabase server env not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
    })
    return false
  }
  return true
}

const getBearerToken = (req) => {
  const authHeader = req.header('authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

const requireUser = async (req, res) => {
  if (!validateSupabase(res)) return null
  const token = getBearerToken(req)
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' })
    return null
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) {
    res.status(401).json({ error: error?.message || 'Invalid token' })
    return null
  }
  return data.user
}

const loadUserProfile = async (userId) => {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('user_profiles')
    .select(
      'id, user_id, role, branch_id, city, physical_address, is_approved, must_reset_password, approved_by, approved_at, created_at',
    )
    .eq('user_id', userId)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (existing) return existing

  const { count: adminCount, error: adminCountError } = await supabaseAdmin
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', ADMIN_ROLE)
  if (adminCountError) throw new Error(adminCountError.message)

  const isFirstAdmin = (adminCount || 0) === 0

  const { data: created, error: createError } = await supabaseAdmin
    .from('user_profiles')
    .insert({
      user_id: userId,
      role: isFirstAdmin ? ADMIN_ROLE : 'Policy Holder',
      branch_id: null,
      city: null,
      physical_address: null,
      is_approved: isFirstAdmin,
      must_reset_password: true,
      approved_by: isFirstAdmin ? userId : null,
      approved_at: isFirstAdmin ? new Date().toISOString() : null,
    })
    .select(
      'id, user_id, role, branch_id, is_approved, must_reset_password, approved_by, approved_at, created_at',
    )
    .single()
  if (createError) throw new Error(createError.message)
  return created
}

const ensureRoleAllowed = (profile, allowedRoles, res) => {
  if (!allowedRoles.has(profile.role)) {
    res.status(403).json({ error: `Role "${profile.role}" is not allowed for this action` })
    return false
  }
  return true
}

const getSystemAdminCount = async () => {
  const { count, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', ADMIN_ROLE)
  if (error) throw new Error(error.message)
  return count || 0
}

const ensureApproved = (profile, res) => {
  if (!profile.is_approved) {
    res.status(403).json({
      error: 'Your account is pending System Administrator approval',
      code: 'ACCOUNT_NOT_APPROVED',
    })
    return false
  }
  return true
}

const enforceBranchScope = (profile, requestedBranchId, res) => {
  const isBranchScopedRole = profile.role === 'Branch Manager' || profile.role === 'Stores Clerk'
  if (!isBranchScopedRole) return true
  if (!profile.branch_id) {
    res.status(403).json({ error: 'Your account has no branch assigned' })
    return false
  }
  if (requestedBranchId !== profile.branch_id) {
    res.status(403).json({ error: 'You can only perform actions for your assigned branch' })
    return false
  }
  return true
}

const requireApprovedProfile = async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return null
  let profile
  try {
    profile = await loadUserProfile(user.id)
  } catch (profileError) {
    res.status(400).json({ error: profileError.message })
    return null
  }
  if (!ensureApproved(profile, res)) return null
  return { user, profile }
}

const requireAdmin = async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return null
  if (auth.profile.role !== ADMIN_ROLE) {
    res.status(403).json({ error: 'System Administrator access required' })
    return null
  }
  return auth
}

// Health check for local dev / uptime monitoring.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/me', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  try {
    const profile = await loadUserProfile(user.id)
    return res.json({ user, profile })
  } catch (profileError) {
    return res.status(400).json({ error: profileError.message })
  }
})

app.post('/api/auth/signup', async (req, res) => {
  if (!validateSupabase(res)) return
  const { email, password, username, city, physicalAddress } = req.body ?? {}
  if (!email || !password || !city || !physicalAddress) {
    return res.status(400).json({ error: 'email, password, city and physicalAddress are required' })
  }

  const adminCount = await getSystemAdminCount()
  const isFirstUser = adminCount === 0

  const { data: createdUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: username || null },
  })
  if (createUserError) return res.status(400).json({ error: createUserError.message })

  const createdUser = createdUserData?.user
  if (!createdUser) return res.status(400).json({ error: 'Failed to create user' })

  const { error: profileError } = await supabaseAdmin.from('user_profiles').upsert(
    {
      user_id: createdUser.id,
      role: isFirstUser ? ADMIN_ROLE : 'Policy Holder',
      branch_id: null,
      city,
      physical_address: physicalAddress,
      is_approved: isFirstUser,
      must_reset_password: true,
      approved_by: isFirstUser ? createdUser.id : null,
      approved_at: isFirstUser ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id' },
  )
  if (profileError) return res.status(400).json({ error: profileError.message })

  return res.json({
    ok: true,
    userId: createdUser.id,
    isSystemAdministrator: isFirstUser,
    approved: isFirstUser,
  })
})

app.get('/api/branches', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { profile } = auth

  if (!validateSupabase(res)) return
  let query = supabaseAdmin
    .from('branches')
    .select('id, name, code, created_at')
    .order('name', { ascending: true })
  if ((profile.role === 'Branch Manager' || profile.role === 'Stores Clerk') && profile.branch_id) {
    query = query.eq('id', profile.branch_id)
  }

  const { data, error } = await query

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ branches: data })
})

app.get('/api/casket-types', async (_req, res) => {
  const auth = await requireApprovedProfile(_req, res)
  if (!auth) return
  if (!validateSupabase(res)) return
  const { data, error } = await supabaseAdmin
    .from('casket_types')
    .select('id, sku, name, unit')
    .order('name', { ascending: true })

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ casketTypes: data })
})

app.get('/api/stock-balances', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { profile } = auth

  if (!validateSupabase(res)) return
  let query = supabaseAdmin
    .from('inventory_balances')
    .select(
      'id, quantity_on_hand, updated_at, branch:branches(id, name, code), casket_type:casket_types(id, sku, name)',
    )
    .order('updated_at', { ascending: false })
  if ((profile.role === 'Branch Manager' || profile.role === 'Stores Clerk') && profile.branch_id) {
    query = query.eq('branch_id', profile.branch_id)
  }
  const { data, error } = await query

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ balances: data })
})

app.post('/api/stock/receive', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user, profile } = auth
  if (!ensureRoleAllowed(profile, STOCK_EDIT_ROLES, res)) return

  const { branchId, casketTypeId, quantity, notes } = req.body ?? {}
  const qty = Number(quantity)

  if (!branchId || !casketTypeId || !Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({
      error: 'branchId, casketTypeId, and positive quantity are required',
    })
  }
  if (!enforceBranchScope(profile, branchId, res)) return

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('inventory_balances')
    .select('id, quantity_on_hand')
    .eq('branch_id', branchId)
    .eq('casket_type_id', casketTypeId)
    .maybeSingle()

  if (existingError) return res.status(400).json({ error: existingError.message })

  const nextQuantity = Number(existing?.quantity_on_hand || 0) + qty

  const { error: upsertError } = await supabaseAdmin.from('inventory_balances').upsert(
    {
      branch_id: branchId,
      casket_type_id: casketTypeId,
      quantity_on_hand: nextQuantity,
    },
    { onConflict: 'branch_id,casket_type_id' },
  )
  if (upsertError) return res.status(400).json({ error: upsertError.message })

  const { error: movementError } = await supabaseAdmin.from('stock_movements').insert({
    branch_id: branchId,
    casket_type_id: casketTypeId,
    movement_type: 'IN',
    quantity: qty,
    notes: notes || 'Stock received',
    created_by: user.id,
  })
  if (movementError) return res.status(400).json({ error: movementError.message })

  return res.json({ ok: true, quantityOnHand: nextQuantity })
})

app.get('/api/claims/pending-clerk', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { profile } = auth
  if (profile.role !== 'Stores Clerk') {
    return res.status(403).json({ error: 'Stores Clerk access required' })
  }
  if (!profile.branch_id) return res.status(403).json({ error: 'Stores Clerk has no branch assigned' })

  const { data, error } = await supabaseAdmin
    .from('claims')
    .select(
      'id, policy_number, policy_holder_name, status, created_at, requested_quantity, requested_casket_type:casket_types(id, sku, name), branch:branches(id, name, code)',
    )
    .eq('branch_id', profile.branch_id)
    .eq('status', 'pending')
    .eq('clerk_approval_status', 'pending')
    .order('created_at', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ claims: data || [] })
})

app.patch('/api/claims/:claimId/clerk-review', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user, profile } = auth
  if (profile.role !== 'Stores Clerk') {
    return res.status(403).json({ error: 'Stores Clerk access required' })
  }
  if (!profile.branch_id) return res.status(403).json({ error: 'Stores Clerk has no branch assigned' })

  const { claimId } = req.params
  const { decision, notes } = req.body ?? {}
  if (!claimId || !['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'claimId and decision (approve|reject) are required' })
  }

  const { data: claim, error: claimError } = await supabaseAdmin
    .from('claims')
    .select('id, branch_id, status')
    .eq('id', claimId)
    .maybeSingle()
  if (claimError) return res.status(400).json({ error: claimError.message })
  if (!claim) return res.status(404).json({ error: 'Claim not found' })
  if (claim.branch_id !== profile.branch_id) {
    return res.status(403).json({ error: 'You can only review claims in your assigned branch' })
  }
  if (claim.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending claims can be reviewed' })
  }

  const isApprove = decision === 'approve'
  const { error: updateError } = await supabaseAdmin
    .from('claims')
    .update({
      clerk_approval_status: isApprove ? 'approved' : 'rejected',
      clerk_approved_by: user.id,
      clerk_approved_at: new Date().toISOString(),
      clerk_notes: notes || null,
      status: isApprove ? 'pending_manager' : 'cancelled',
    })
    .eq('id', claimId)
  if (updateError) return res.status(400).json({ error: updateError.message })

  return res.json({ ok: true })
})

app.get('/api/claims/pending-manager', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { profile } = auth
  if (profile.role !== 'Branch Manager') {
    return res.status(403).json({ error: 'Branch Manager access required' })
  }
  if (!profile.branch_id) return res.status(403).json({ error: 'Branch Manager has no branch assigned' })

  let query = supabaseAdmin
    .from('claims')
    .select(
      'id, policy_number, policy_holder_name, status, created_at, requested_quantity, requested_casket_type:casket_types(id, sku, name), branch:branches(id, name, code)',
    )
    .eq('status', 'pending_manager')
    .eq('clerk_approval_status', 'approved')
    .eq('manager_approval_status', 'pending')
    .order('created_at', { ascending: false })
  query = query.eq('branch_id', profile.branch_id)
  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ claims: data || [] })
})

app.patch('/api/claims/:claimId/manager-review', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user, profile } = auth
  if (profile.role !== 'Branch Manager') {
    return res.status(403).json({ error: 'Branch Manager access required' })
  }
  if (!profile.branch_id) return res.status(403).json({ error: 'Branch Manager has no branch assigned' })

  const { claimId } = req.params
  const { decision, notes } = req.body ?? {}
  if (!claimId || !['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'claimId and decision (approve|reject) are required' })
  }

  const { data: claim, error: claimError } = await supabaseAdmin
    .from('claims')
    .select(
      'id, policy_number, branch_id, status, requested_quantity, requested_casket_type_id, clerk_approval_status',
    )
    .eq('id', claimId)
    .maybeSingle()
  if (claimError) return res.status(400).json({ error: claimError.message })
  if (!claim) return res.status(404).json({ error: 'Claim not found' })
  if (claim.branch_id !== profile.branch_id) {
    return res.status(403).json({ error: 'You can only review claims in your assigned branch' })
  }
  if (claim.status !== 'pending_manager' || claim.clerk_approval_status !== 'approved') {
    return res.status(400).json({ error: 'Claim must first be approved by Stores Clerk' })
  }

  const isApprove = decision === 'approve'
  if (!isApprove) {
    const { error: rejectError } = await supabaseAdmin
      .from('claims')
      .update({
        manager_approval_status: 'rejected',
        manager_approved_by: user.id,
        manager_approved_at: new Date().toISOString(),
        manager_notes: notes || null,
        status: 'cancelled',
      })
      .eq('id', claimId)
    if (rejectError) return res.status(400).json({ error: rejectError.message })
    return res.json({ ok: true })
  }

  const qty = Number(claim.requested_quantity || 0)
  if (qty <= 0) return res.status(400).json({ error: 'Invalid requested quantity' })

  const { data: balance, error: balanceError } = await supabaseAdmin
    .from('inventory_balances')
    .select('id, quantity_on_hand')
    .eq('branch_id', claim.branch_id)
    .eq('casket_type_id', claim.requested_casket_type_id)
    .maybeSingle()
  if (balanceError) return res.status(400).json({ error: balanceError.message })

  const available = Number(balance?.quantity_on_hand || 0)
  if (available < qty) {
    return res.status(400).json({
      error: `Insufficient stock. Available: ${available}, requested: ${qty}`,
    })
  }

  const nextQuantity = available - qty
  const { error: updateBalanceError } = await supabaseAdmin
    .from('inventory_balances')
    .update({ quantity_on_hand: nextQuantity })
    .eq('id', balance.id)
  if (updateBalanceError) return res.status(400).json({ error: updateBalanceError.message })

  const { error: issueError } = await supabaseAdmin.from('casket_issues').insert({
    claim_id: claim.id,
    branch_id: claim.branch_id,
    casket_type_id: claim.requested_casket_type_id,
    quantity: qty,
    issued_by: user.id,
    notes: notes || 'Issued after dual approval',
  })
  if (issueError) return res.status(400).json({ error: issueError.message })

  const { error: movementError } = await supabaseAdmin.from('stock_movements').insert({
    branch_id: claim.branch_id,
    casket_type_id: claim.requested_casket_type_id,
    movement_type: 'OUT',
    quantity: qty,
    notes: `Issued for approved claim ${claim.policy_number}`,
    reference_claim_id: claim.id,
    created_by: user.id,
  })
  if (movementError) return res.status(400).json({ error: movementError.message })

  const { error: claimUpdateError } = await supabaseAdmin
    .from('claims')
    .update({
      manager_approval_status: 'approved',
      manager_approved_by: user.id,
      manager_approved_at: new Date().toISOString(),
      manager_notes: notes || null,
      status: 'issued',
    })
    .eq('id', claim.id)
  if (claimUpdateError) return res.status(400).json({ error: claimUpdateError.message })

  return res.json({ ok: true, quantityOnHand: nextQuantity })
})

app.get('/api/policy-holder/claims', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user, profile } = auth
  if (profile.role !== 'Policy Holder') {
    return res.status(403).json({ error: 'Policy Holder access required' })
  }

  const { data, error } = await supabaseAdmin
    .from('claims')
    .select(
      'id, policy_number, policy_holder_name, status, notes, requested_casket_type:casket_types(id, sku, name), requested_quantity, branch:branches(id, name, code), created_at',
    )
    .eq('policy_holder_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ claims: data || [] })
})

app.post('/api/policy-holder/claims', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user, profile } = auth
  if (profile.role !== 'Policy Holder') {
    return res.status(403).json({ error: 'Policy Holder access required' })
  }

  const { policyNumber, policyHolderName, branchId, requestedCasketTypeId, requestedQuantity, notes } = req.body ?? {}
  const qty = Number(requestedQuantity || 1)

  if (!policyNumber || !policyHolderName || !branchId || !requestedCasketTypeId || !Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({
      error:
        'policyNumber, policyHolderName, branchId, requestedCasketTypeId, and positive requestedQuantity are required',
    })
  }
  if (!POLICY_NUMBER_REGEX.test(String(policyNumber).toUpperCase())) {
    return res.status(400).json({ error: 'Policy number must match format D00001A' })
  }

  const { data, error } = await supabaseAdmin
    .from('claims')
    .insert({
      policy_number: policyNumber,
      policy_holder_name: policyHolderName,
      branch_id: branchId,
      status: 'pending',
      notes: notes || null,
      created_by: user.id,
      policy_holder_user_id: user.id,
      requested_casket_type_id: requestedCasketTypeId,
      requested_quantity: qty,
    })
    .select('id')
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ ok: true, claimId: data.id })
})

app.post('/api/stock-receipts', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user, profile } = auth
  if (profile.role !== 'Stores Clerk') {
    return res.status(403).json({ error: 'Stores Clerk access required' })
  }
  if (!profile.branch_id) return res.status(403).json({ error: 'Stores Clerk has no branch assigned' })

  const { items, deliveryNoteUrl, deliveryNoteName, notes } = req.body ?? {}
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          casketTypeId: item?.casketTypeId,
          quantity: Number(item?.quantity),
        }))
        .filter((item) => item.casketTypeId && Number.isFinite(item.quantity) && item.quantity > 0)
    : []

  if (!normalizedItems.length || !deliveryNoteUrl || !deliveryNoteName) {
    return res.status(400).json({
      error: 'At least one casket item plus deliveryNoteUrl and deliveryNoteName are required',
    })
  }

  const firstItem = normalizedItems[0]

  const { data, error } = await supabaseAdmin
    .from('stock_receipts')
    .insert({
      branch_id: profile.branch_id,
      casket_type_id: firstItem.casketTypeId,
      quantity: firstItem.quantity,
      delivery_note_url: deliveryNoteUrl,
      delivery_note_name: deliveryNoteName,
      notes: notes || null,
      submitted_by: user.id,
      status: 'pending_manager',
    })
    .select('id')
    .single()
  if (error) return res.status(400).json({ error: error.message })

  const { error: itemsError } = await supabaseAdmin.from('stock_receipt_items').insert(
    normalizedItems.map((item) => ({
      receipt_id: data.id,
      casket_type_id: item.casketTypeId,
      quantity: item.quantity,
    })),
  )
  if (itemsError) return res.status(400).json({ error: itemsError.message })

  return res.json({ ok: true, receiptId: data.id })
})

app.post('/api/storage/signed-upload', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user, profile } = auth
  if (profile.role !== 'Stores Clerk') {
    return res.status(403).json({ error: 'Stores Clerk access required' })
  }

  const { fileName } = req.body ?? {}
  if (!fileName) return res.status(400).json({ error: 'fileName is required' })

  const safeFileName = String(fileName).replace(/\s+/g, '-')
  const path = `stock-receipts/${user.id}/${Date.now()}-${safeFileName}`

  const { data, error } = await supabaseAdmin.storage
    .from('supporting-documents')
    .createSignedUploadUrl(path)
  if (error) return res.status(400).json({ error: error.message })

  const { data: publicUrlData } = supabaseAdmin.storage.from('supporting-documents').getPublicUrl(path)
  return res.json({
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: publicUrlData.publicUrl,
  })
})

app.get('/api/stock-receipts/pending-manager', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { profile } = auth
  if (profile.role !== 'Branch Manager') {
    return res.status(403).json({ error: 'Branch Manager access required' })
  }
  if (!profile.branch_id) return res.status(403).json({ error: 'Branch Manager has no branch assigned' })

  let query = supabaseAdmin
    .from('stock_receipts')
    .select(
      'id, quantity, status, delivery_note_url, delivery_note_name, notes, created_at, branch:branches(id, name, code), items:stock_receipt_items(id, quantity, casket_type:casket_types(id, sku, name))',
    )
    .eq('status', 'pending_manager')
    .order('created_at', { ascending: false })
  query = query.eq('branch_id', profile.branch_id)
  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ receipts: data || [] })
})

app.patch('/api/stock-receipts/:receiptId/manager-review', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user, profile } = auth
  if (profile.role !== 'Branch Manager') {
    return res.status(403).json({ error: 'Branch Manager access required' })
  }
  if (!profile.branch_id) return res.status(403).json({ error: 'Branch Manager has no branch assigned' })

  const { receiptId } = req.params
  const { decision, notes } = req.body ?? {}
  if (!receiptId || !['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'receiptId and decision (approve|reject) are required' })
  }

  const { data: receipt, error: receiptError } = await supabaseAdmin
    .from('stock_receipts')
    .select('id, branch_id, casket_type_id, quantity, status')
    .eq('id', receiptId)
    .maybeSingle()
  if (receiptError) return res.status(400).json({ error: receiptError.message })
  if (!receipt) return res.status(404).json({ error: 'Receipt not found' })
  if (receipt.branch_id !== profile.branch_id) {
    return res.status(403).json({ error: 'You can only review receipts in your assigned branch' })
  }
  if (receipt.status !== 'pending_manager') {
    return res.status(400).json({ error: 'Receipt already reviewed' })
  }

  const { data: itemRows, error: itemsError } = await supabaseAdmin
    .from('stock_receipt_items')
    .select('casket_type_id, quantity')
    .eq('receipt_id', receipt.id)
  if (itemsError) return res.status(400).json({ error: itemsError.message })

  const receiptItems =
    itemRows && itemRows.length
      ? itemRows.map((row) => ({ casketTypeId: row.casket_type_id, quantity: Number(row.quantity) }))
      : [{ casketTypeId: receipt.casket_type_id, quantity: Number(receipt.quantity) }]

  if (decision === 'reject') {
    const { error: rejectError } = await supabaseAdmin
      .from('stock_receipts')
      .update({
        status: 'rejected',
        manager_reviewed_by: user.id,
        manager_reviewed_at: new Date().toISOString(),
        manager_notes: notes || null,
      })
      .eq('id', receipt.id)
    if (rejectError) return res.status(400).json({ error: rejectError.message })
    return res.json({ ok: true })
  }

  for (const item of receiptItems) {
    const qty = Number(item.quantity || 0)
    if (qty <= 0) continue

    const { data: existingBalance, error: existingError } = await supabaseAdmin
      .from('inventory_balances')
      .select('id, quantity_on_hand')
      .eq('branch_id', receipt.branch_id)
      .eq('casket_type_id', item.casketTypeId)
      .maybeSingle()
    if (existingError) return res.status(400).json({ error: existingError.message })

    const nextQuantity = Number(existingBalance?.quantity_on_hand || 0) + qty
    const { error: upsertError } = await supabaseAdmin.from('inventory_balances').upsert(
      {
        branch_id: receipt.branch_id,
        casket_type_id: item.casketTypeId,
        quantity_on_hand: nextQuantity,
      },
      { onConflict: 'branch_id,casket_type_id' },
    )
    if (upsertError) return res.status(400).json({ error: upsertError.message })

    const { error: movementError } = await supabaseAdmin.from('stock_movements').insert({
      branch_id: receipt.branch_id,
      casket_type_id: item.casketTypeId,
      movement_type: 'IN',
      quantity: qty,
      notes: 'Stock receipt approved by branch manager',
      created_by: user.id,
    })
    if (movementError) return res.status(400).json({ error: movementError.message })
  }

  const { error: approvalError } = await supabaseAdmin
    .from('stock_receipts')
    .update({
      status: 'approved',
      manager_reviewed_by: user.id,
      manager_reviewed_at: new Date().toISOString(),
      manager_notes: notes || null,
    })
    .eq('id', receipt.id)
  if (approvalError) return res.status(400).json({ error: approvalError.message })

  return res.json({ ok: true })
})

app.get('/api/reports/stock-summary', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { profile } = auth
  if (!REPORT_ROLES.has(profile.role)) {
    return res.status(403).json({ error: 'Manager access required' })
  }

  const period = req.query.period || 'weekly'
  const now = new Date()
  let fromDate = req.query.from ? new Date(String(req.query.from)) : null
  let toDate = req.query.to ? new Date(String(req.query.to)) : now
  const view = req.query.view === 'company' ? 'company' : 'branch'
  const requestedBranchId = req.query.branchId ? String(req.query.branchId) : null

  if (!fromDate) {
    if (period === 'monthly') {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else {
      const day = now.getDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      fromDate = new Date(now)
      fromDate.setDate(now.getDate() + mondayOffset)
      fromDate.setHours(0, 0, 0, 0)
    }
  }
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid from/to date' })
  }

  let query = supabaseAdmin
    .from('stock_movements')
    .select(
      'id, movement_type, quantity, created_at, branch:branches(id, name, code), casket_type:casket_types(id, sku, name)',
    )
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: false })
  if ((profile.role === 'Branch Manager' || profile.role === 'Stores Clerk') && profile.branch_id) {
    query = query.eq('branch_id', profile.branch_id)
  } else if (profile.role === 'General Manager' && view === 'branch') {
    if (!requestedBranchId) {
      return res.status(400).json({ error: 'branchId is required when view=branch' })
    }
    query = query.eq('branch_id', requestedBranchId)
  }
  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })

  const byKey = new Map()
  const companyView = profile.role === 'General Manager' && view === 'company'
  for (const row of data || []) {
    const key = companyView
      ? `company:${row.casket_type?.id || 'na'}`
      : `${row.branch?.id || 'na'}:${row.casket_type?.id || 'na'}`
    const existing = byKey.get(key) || {
      branch: companyView ? { id: 'all', name: 'All Branches', code: 'ALL' } : row.branch,
      casket_type: row.casket_type,
      in_qty: 0,
      out_qty: 0,
      net: 0,
    }
    const qty = Number(row.quantity || 0)
    if (row.movement_type === 'IN') existing.in_qty += qty
    if (row.movement_type === 'OUT') existing.out_qty += qty
    existing.net = existing.in_qty - existing.out_qty
    byKey.set(key, existing)
  }

  return res.json({
    period,
    view: companyView ? 'company' : 'branch',
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    rows: Array.from(byKey.values()),
  })
})

app.get('/api/reports/stock-detailed', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { profile } = auth
  if (!REPORT_ROLES.has(profile.role)) {
    return res.status(403).json({ error: 'Manager access required' })
  }

  const period = req.query.period || 'weekly'
  const now = new Date()
  let fromDate = req.query.from ? new Date(String(req.query.from)) : null
  let toDate = req.query.to ? new Date(String(req.query.to)) : now
  const view = req.query.view === 'company' ? 'company' : 'branch'
  const requestedBranchId = req.query.branchId ? String(req.query.branchId) : null

  if (!fromDate) {
    if (period === 'monthly') {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else {
      const day = now.getDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      fromDate = new Date(now)
      fromDate.setDate(now.getDate() + mondayOffset)
      fromDate.setHours(0, 0, 0, 0)
    }
  }
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid from/to date' })
  }

  const companyView = profile.role === 'General Manager' && view === 'company'
  let scopedBranchId = null
  if ((profile.role === 'Branch Manager' || profile.role === 'Stores Clerk') && profile.branch_id) {
    scopedBranchId = profile.branch_id
  } else if (profile.role === 'General Manager' && !companyView) {
    if (!requestedBranchId) {
      return res.status(400).json({ error: 'branchId is required when view=branch' })
    }
    scopedBranchId = requestedBranchId
  }

  let beforeQuery = supabaseAdmin
    .from('stock_movements')
    .select('movement_type, quantity')
    .lt('created_at', fromDate.toISOString())
  let inRangeQuery = supabaseAdmin
    .from('stock_movements')
    .select(
      'id, movement_type, quantity, created_at, branch:branches(id, name, code), casket_type:casket_types(id, sku, name)',
    )
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: true })
  let claimsQuery = supabaseAdmin
    .from('claims')
    .select('id, policy_number, policy_holder_name, created_at, created_by, branch:branches(id, name, code)')
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: true })
  let receiptsQuery = supabaseAdmin
    .from('stock_receipts')
    .select('id, delivery_note_name, created_at, submitted_by, branch:branches(id, name, code)')
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: true })

  if (scopedBranchId) {
    beforeQuery = beforeQuery.eq('branch_id', scopedBranchId)
    inRangeQuery = inRangeQuery.eq('branch_id', scopedBranchId)
    claimsQuery = claimsQuery.eq('branch_id', scopedBranchId)
    receiptsQuery = receiptsQuery.eq('branch_id', scopedBranchId)
  }

  const [
    { data: beforeRows, error: beforeError },
    { data: inRangeRows, error: inRangeError },
    { data: claimsRows, error: claimsError },
    { data: receiptsRows, error: receiptsError },
  ] = await Promise.all([beforeQuery, inRangeQuery, claimsQuery, receiptsQuery])

  if (beforeError) return res.status(400).json({ error: beforeError.message })
  if (inRangeError) return res.status(400).json({ error: inRangeError.message })
  if (claimsError) return res.status(400).json({ error: claimsError.message })
  if (receiptsError) return res.status(400).json({ error: receiptsError.message })

  const openingBalance = (beforeRows || []).reduce((sum, row) => {
    const qty = Number(row.quantity || 0)
    if (row.movement_type === 'IN') return sum + qty
    if (row.movement_type === 'OUT') return sum - qty
    return sum
  }, 0)

  const periodNet = (inRangeRows || []).reduce((sum, row) => {
    const qty = Number(row.quantity || 0)
    if (row.movement_type === 'IN') return sum + qty
    if (row.movement_type === 'OUT') return sum - qty
    return sum
  }, 0)
  const closingBalance = openingBalance + periodNet

  const userIds = new Set()
  for (const claim of claimsRows || []) if (claim.created_by) userIds.add(claim.created_by)
  for (const receipt of receiptsRows || []) if (receipt.submitted_by) userIds.add(receipt.submitted_by)
  const usersList = await supabaseAdmin.auth.admin.listUsers()
  const emailById = new Map(
    (usersList?.data?.users || usersList?.users || []).map((user) => [user.id, user.email || null]),
  )

  const claims = (claimsRows || []).map((claim) => ({
    id: claim.id,
    date: claim.created_at,
    policy_number: claim.policy_number,
    policy_holder_name: claim.policy_holder_name,
    branch: claim.branch,
    claimed_by: emailById.get(claim.created_by) || 'Unknown user',
  }))

  const receipts = (receiptsRows || []).map((receipt) => ({
    id: receipt.id,
    date: receipt.created_at,
    delivery_note_name: receipt.delivery_note_name,
    branch: receipt.branch,
    received_by: emailById.get(receipt.submitted_by) || 'Unknown user',
  }))

  const ledger = (inRangeRows || []).map((row) => ({
    id: row.id,
    date: row.created_at,
    description: `${row.movement_type === 'IN' ? 'Stock In' : row.movement_type === 'OUT' ? 'Stock Out' : 'Adjustment'} - ${row.casket_type?.name || 'Unknown'} (${row.quantity})`,
    branch: row.branch,
  }))

  return res.json({
    period,
    view: companyView ? 'company' : 'branch',
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    openingBalance,
    closingBalance,
    ledger,
    claims,
    receipts,
  })
})

app.get('/api/reports/low-stock', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { profile } = auth

  const threshold = Number(req.query.threshold || 5)
  const branchId = req.query.branchId ? String(req.query.branchId) : null
  let query = supabaseAdmin
    .from('inventory_balances')
    .select(
      'id, quantity_on_hand, branch:branches(id, name, code), casket_type:casket_types(id, sku, name)',
    )
    .lte('quantity_on_hand', threshold)
    .order('quantity_on_hand', { ascending: true })

  if ((profile.role === 'Branch Manager' || profile.role === 'Stores Clerk') && profile.branch_id) {
    query = query.eq('branch_id', profile.branch_id)
  } else if (profile.role === 'General Manager' && branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ threshold, rows: data })
})

app.get('/api/reports/issues', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { profile } = auth

  const from = req.query.from
  const to = req.query.to
  const branchId = req.query.branchId ? String(req.query.branchId) : null

  let query = supabaseAdmin
    .from('casket_issues')
    .select(
      'id, issued_at, quantity, branch:branches(id, name, code), casket_type:casket_types(id, sku, name)',
    )
    .order('issued_at', { ascending: false })
  if (from) query = query.gte('issued_at', from)
  if (to) query = query.lte('issued_at', to)
  if ((profile.role === 'Branch Manager' || profile.role === 'Stores Clerk') && profile.branch_id) {
    query = query.eq('branch_id', profile.branch_id)
  } else if (profile.role === 'General Manager' && branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  const totalIssued = (data || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  return res.json({ totalIssued, rows: data || [] })
})

app.get('/api/admin/users', async (req, res) => {
  const auth = await requireAdmin(req, res)
  if (!auth) return

  const [{ data: profileRows, error: profileError }, { data: authUsers, error: usersError }] =
    await Promise.all([
      supabaseAdmin
        .from('user_profiles')
        .select(
          'id, user_id, role, branch_id, is_approved, must_reset_password, approved_at, created_at',
        )
        .order('created_at', { ascending: false }),
      supabaseAdmin.auth.admin.listUsers(),
    ])

  if (profileError) return res.status(400).json({ error: profileError.message })
  if (usersError) return res.status(400).json({ error: usersError.message })

  const authById = new Map((authUsers?.users || []).map((u) => [u.id, u]))
  const users = (profileRows || []).map((profile) => {
    const authUser = authById.get(profile.user_id)
    return {
      ...profile,
      email: authUser?.email || null,
      lastSignInAt: authUser?.last_sign_in_at || null,
    }
  })

  return res.json({ users })
})

app.post('/api/admin/users', async (req, res) => {
  const auth = await requireAdmin(req, res)
  if (!auth) return

  const { email, password, role, branchId, username, city, physicalAddress } = req.body ?? {}
  if (!email || !password || !role || !city || !physicalAddress) {
    return res.status(400).json({ error: 'email, password, role, city and physicalAddress are required' })
  }

  const { data: createdUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username: username || null,
    },
  })
  if (createUserError) return res.status(400).json({ error: createUserError.message })

  const createdUser = createdUserData?.user
  if (!createdUser) return res.status(400).json({ error: 'Failed to create user' })

  const { error: profileError } = await supabaseAdmin.from('user_profiles').upsert(
    {
      user_id: createdUser.id,
      role,
      branch_id: branchId || null,
      city,
      physical_address: physicalAddress,
      is_approved: true,
      must_reset_password: true,
      approved_by: auth.user.id,
      approved_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (profileError) return res.status(400).json({ error: profileError.message })

  return res.json({ ok: true, userId: createdUser.id })
})

app.patch('/api/admin/users/:userId', async (req, res) => {
  const auth = await requireAdmin(req, res)
  if (!auth) return

  const { userId } = req.params
  const { role, branchId, isApproved, mustResetPassword } = req.body ?? {}
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from('user_profiles')
    .select('user_id, role')
    .eq('user_id', userId)
    .maybeSingle()
  if (existingProfileError) return res.status(400).json({ error: existingProfileError.message })
  if (!existingProfile) return res.status(404).json({ error: 'User profile not found' })

  const updates = {}
  if (role !== undefined) updates.role = role
  if (branchId !== undefined) updates.branch_id = branchId || null
  if (isApproved !== undefined) {
    updates.is_approved = Boolean(isApproved)
    updates.approved_at = isApproved ? new Date().toISOString() : null
    updates.approved_by = isApproved ? auth.user.id : null
  }
  if (mustResetPassword !== undefined) {
    updates.must_reset_password = Boolean(mustResetPassword)
  }

  const nextRole = updates.role ?? existingProfile.role
  const wasAdmin = existingProfile.role === ADMIN_ROLE
  const remainsAdmin = nextRole === ADMIN_ROLE
  if (wasAdmin && !remainsAdmin) {
    const adminCount = await getSystemAdminCount()
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'System must always have at least one System Administrator' })
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updates provided' })
  }

  const { error } = await supabaseAdmin.from('user_profiles').update(updates).eq('user_id', userId)
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ ok: true })
})

app.patch('/api/me/password', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user } = auth
  const { newPassword } = req.body ?? {}

  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'newPassword (min 6 chars) is required' })
  }

  const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  })
  if (authUpdateError) return res.status(400).json({ error: authUpdateError.message })

  const { error: profileUpdateError } = await supabaseAdmin
    .from('user_profiles')
    .update({ must_reset_password: false })
    .eq('user_id', user.id)
  if (profileUpdateError) return res.status(400).json({ error: profileUpdateError.message })

  return res.json({ ok: true })
})

app.patch('/api/me/profile', async (req, res) => {
  const auth = await requireApprovedProfile(req, res)
  if (!auth) return
  const { user } = auth

  const { username, city, physicalAddress } = req.body ?? {}

  const hasAny =
    username !== undefined || city !== undefined || physicalAddress !== undefined
  if (!hasAny) {
    return res.status(400).json({ error: 'Provide at least one of username, city, physicalAddress' })
  }

  if (username !== undefined) {
    const nextUsername = String(username).trim()
    if (nextUsername.length < 2) {
      return res.status(400).json({ error: 'username must be at least 2 characters' })
    }
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { username: nextUsername },
    })
    if (updateAuthError) return res.status(400).json({ error: updateAuthError.message })
  }

  const profileUpdates = {}
  if (city !== undefined) profileUpdates.city = String(city).trim() || null
  if (physicalAddress !== undefined) profileUpdates.physical_address = String(physicalAddress).trim() || null
  if (Object.keys(profileUpdates).length) {
    const { error: profileUpdateError } = await supabaseAdmin
      .from('user_profiles')
      .update(profileUpdates)
      .eq('user_id', user.id)
    if (profileUpdateError) return res.status(400).json({ error: profileUpdateError.message })
  }

  return res.json({ ok: true })
})

app.delete('/api/admin/users/:userId', async (req, res) => {
  const auth = await requireAdmin(req, res)
  if (!auth) return
  const { userId } = req.params
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  if (userId === auth.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own System Administrator account' })
  }

  const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()
  if (targetProfileError) return res.status(400).json({ error: targetProfileError.message })
  if (targetProfile?.role === ADMIN_ROLE) {
    const adminCount = await getSystemAdminCount()
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'System must always have at least one System Administrator' })
    }
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ ok: true })
})

// SPA fallback (must be after all /api routes).
if (IS_PRODUCTION) {
  // Express 5 / path-to-regexp doesn't support "*" as a route string.
  // Use a regex fallback and explicitly exclude /api routes.
  app.get(/^(?!\/api).*/, (_req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res.json({ service: 'server', status: 'running' })
  })
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`)
})

