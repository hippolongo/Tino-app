import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { apiRequest } from './lib/api'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import './App.css'
const POLICY_NUMBER_REGEX = /^D\d{5}[A-Z]$/

const roles = [
  'General Manager',
  'Stores Clerk',
  'Branch Manager',
  'Policy Holder',
  'System Administrator',
]

function App() {
  const [mode, setMode] = useState('login')
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [branches, setBranches] = useState([])
  const [casketTypes, setCasketTypes] = useState([])
  const [balances, setBalances] = useState([])
  const [profile, setProfile] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])
  const [adminEdits, setAdminEdits] = useState({})
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [city, setCity] = useState('')
  const [physicalAddress, setPhysicalAddress] = useState('')
  const [createUserEmail, setCreateUserEmail] = useState('')
  const [createUserPassword, setCreateUserPassword] = useState('')
  const [createUserUsername, setCreateUserUsername] = useState('')
  const [createUserCity, setCreateUserCity] = useState('')
  const [createUserPhysicalAddress, setCreateUserPhysicalAddress] = useState('')
  const [createUserRole, setCreateUserRole] = useState('Policy Holder')
  const [createUserBranchId, setCreateUserBranchId] = useState('')
  const [receiveBranchId, setReceiveBranchId] = useState('')
  const [receiveCasketTypeId, setReceiveCasketTypeId] = useState('')
  const [receiveQuantity, setReceiveQuantity] = useState(1)
  const [receiveNotes, setReceiveNotes] = useState('')

  const [issuePolicyNumber, setIssuePolicyNumber] = useState('')
  const [issuePolicyHolderName, setIssuePolicyHolderName] = useState('')
  const [issueBranchId, setIssueBranchId] = useState('')
  const [issueCasketTypeId, setIssueCasketTypeId] = useState('')
  const [issueQuantity, setIssueQuantity] = useState(1)
  const [issueNotes, setIssueNotes] = useState('')
  const [myClaims, setMyClaims] = useState([])
  const [claimPolicyNumber, setClaimPolicyNumber] = useState('')
  const [claimPolicyHolderName, setClaimPolicyHolderName] = useState('')
  const [claimBranchId, setClaimBranchId] = useState('')
  const [claimRequestedCasketTypeId, setClaimRequestedCasketTypeId] = useState('')
  const [claimRequestedQuantity, setClaimRequestedQuantity] = useState(1)
  const [claimNotes, setClaimNotes] = useState('')
  const [pendingClerkClaims, setPendingClerkClaims] = useState([])
  const [pendingManagerClaims, setPendingManagerClaims] = useState([])
  const [pendingManagerReceipts, setPendingManagerReceipts] = useState([])
  const [receiptItemQuantities, setReceiptItemQuantities] = useState({})
  const [receiptNotes, setReceiptNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState(null)
  const [issuedReportRows, setIssuedReportRows] = useState([])
  const [totalIssuedFromReport, setTotalIssuedFromReport] = useState(0)
  const [lowStockRows, setLowStockRows] = useState([])
  const [stockSummaryRows, setStockSummaryRows] = useState([])
  const [stockReportPeriod, setStockReportPeriod] = useState('weekly')
  const [stockReportFrom, setStockReportFrom] = useState('')
  const [stockReportTo, setStockReportTo] = useState('')
  const [stockReportScope, setStockReportScope] = useState('branch')
  const [stockReportBranchId, setStockReportBranchId] = useState('')
  const [selectedReceipt, setSelectedReceipt] = useState(null)
  const [detailedLedgerRows, setDetailedLedgerRows] = useState([])
  const [detailedClaimsRows, setDetailedClaimsRows] = useState([])
  const [detailedReceiptsRows, setDetailedReceiptsRows] = useState([])
  const [openingBalanceReport, setOpeningBalanceReport] = useState(0)
  const [closingBalanceReport, setClosingBalanceReport] = useState(0)
  const [activeTab, setActiveTab] = useState('overview')

  const isLogin = useMemo(() => mode === 'login', [mode])
  const totalCasketsAvailable = useMemo(
    () => balances.reduce((sum, row) => sum + Number(row.quantity_on_hand || 0), 0),
    [balances],
  )

  const resetFeedback = () => {
    setError('')
    setMessage('')
  }

  const loadDashboardData = useCallback(async (token) => {
    try {
      const [branchesData, casketTypeData, balanceData, meData] = await Promise.all([
        apiRequest('/api/branches', { token }),
        apiRequest('/api/casket-types', { token }),
        apiRequest('/api/stock-balances', { token }),
        apiRequest('/api/me', { token }),
      ])

      setBranches(branchesData.branches || [])
      setCasketTypes(casketTypeData.casketTypes || [])
      setBalances(balanceData.balances || [])
      setProfile(meData.profile || null)

      if (!meData.profile?.is_approved) {
        await supabase.auth.signOut()
        throw new Error('Your account is pending System Administrator approval.')
      }

      if (meData.profile?.role === 'System Administrator') {
        const adminData = await apiRequest('/api/admin/users', { token })
        setAdminUsers(adminData.users || [])
      } else if (meData.profile?.role === 'Policy Holder') {
        const claimData = await apiRequest('/api/policy-holder/claims', { token })
        setMyClaims(claimData.claims || [])
      } else if (meData.profile?.role === 'Stores Clerk') {
        const [clerkData, reportData] = await Promise.all([
          apiRequest('/api/claims/pending-clerk', { token }),
          apiRequest('/api/reports/stock-summary?period=weekly&view=branch', { token }),
        ])
        setPendingClerkClaims(clerkData.claims || [])
        setStockSummaryRows(reportData.rows || [])
      } else if (meData.profile?.role === 'Branch Manager') {
        const [managerData, issuesData, lowStockData, receiptData, summaryData] = await Promise.all([
          apiRequest('/api/claims/pending-manager', { token }),
          apiRequest('/api/reports/issues', { token }),
          apiRequest('/api/reports/low-stock?threshold=5', { token }),
          apiRequest('/api/stock-receipts/pending-manager', { token }),
          apiRequest('/api/reports/stock-summary?period=weekly&view=branch', { token }),
        ])
        setPendingManagerClaims(managerData.claims || [])
        setPendingManagerReceipts(receiptData.receipts || [])
        setIssuedReportRows(issuesData.rows || [])
        setTotalIssuedFromReport(issuesData.totalIssued || 0)
        setLowStockRows(lowStockData.rows || [])
        setStockSummaryRows(summaryData.rows || [])
      } else if (meData.profile?.role === 'General Manager') {
        const [issuesData, lowStockData, summaryData] = await Promise.all([
          apiRequest('/api/reports/issues', { token }),
          apiRequest('/api/reports/low-stock?threshold=5', { token }),
          apiRequest('/api/reports/stock-summary?period=weekly', { token }),
        ])
        setIssuedReportRows(issuesData.rows || [])
        setTotalIssuedFromReport(issuesData.totalIssued || 0)
        setLowStockRows(lowStockData.rows || [])
        setStockSummaryRows(summaryData.rows || [])
      }

      const firstBranch = branchesData.branches?.[0]?.id || ''
      const firstCasketType = casketTypeData.casketTypes?.[0]?.id || ''

      setReceiveBranchId((prev) => prev || firstBranch)
      setReceiveCasketTypeId((prev) => prev || firstCasketType)
      setIssueBranchId((prev) => prev || firstBranch)
      setIssueCasketTypeId((prev) => prev || firstCasketType)
      setClaimBranchId((prev) => prev || firstBranch)
      setClaimRequestedCasketTypeId((prev) => prev || firstCasketType)
      setStockReportBranchId((prev) => prev || firstBranch)
      setReceiptItemQuantities((prev) => {
        const next = { ...prev }
        for (const type of casketTypeData.casketTypes || []) {
          if (next[type.id] === undefined) next[type.id] = ''
        }
        return next
      })
    } catch (loadError) {
      setError(loadError.message)
    }
  }, [])

  const loadAdminUsers = useCallback(async (token) => {
    try {
      const data = await apiRequest('/api/admin/users', { token })
      setAdminUsers(data.users || [])
    } catch (adminError) {
      setError(adminError.message)
    }
  }, [])

  const loadPolicyHolderClaims = useCallback(async (token) => {
    try {
      const data = await apiRequest('/api/policy-holder/claims', { token })
      setMyClaims(data.claims || [])
    } catch (claimsError) {
      setError(claimsError.message)
    }
  }, [])

  const loadClerkClaims = useCallback(async (token) => {
    try {
      const data = await apiRequest('/api/claims/pending-clerk', { token })
      setPendingClerkClaims(data.claims || [])
    } catch (claimsError) {
      setError(claimsError.message)
    }
  }, [])

  const loadManagerClaims = useCallback(async (token) => {
    try {
      const data = await apiRequest('/api/claims/pending-manager', { token })
      setPendingManagerClaims(data.claims || [])
    } catch (claimsError) {
      setError(claimsError.message)
    }
  }, [])

  const loadPendingManagerReceipts = useCallback(async (token) => {
    try {
      const data = await apiRequest('/api/stock-receipts/pending-manager', { token })
      setPendingManagerReceipts(data.receipts || [])
    } catch (receiptError) {
      setError(receiptError.message)
    }
  }, [])

  const loadManagerReports = useCallback(async (token) => {
    try {
      let issuesPath = '/api/reports/issues'
      let lowStockPath = '/api/reports/low-stock?threshold=5'
      let stockSummaryPath =
        stockReportPeriod === 'range'
          ? `/api/reports/stock-summary?period=range&from=${encodeURIComponent(stockReportFrom)}&to=${encodeURIComponent(stockReportTo)}`
          : `/api/reports/stock-summary?period=${stockReportPeriod}`

      if (profile?.role === 'General Manager') {
        if (stockReportScope === 'company') {
          stockSummaryPath += '&view=company'
        } else {
          stockSummaryPath += `&view=branch&branchId=${encodeURIComponent(stockReportBranchId)}`
          issuesPath += `?branchId=${encodeURIComponent(stockReportBranchId)}`
          lowStockPath += `&branchId=${encodeURIComponent(stockReportBranchId)}`
        }
      } else {
        stockSummaryPath += '&view=branch'
      }

      const [issuesData, lowStockData, summaryData] = await Promise.all([
        apiRequest(issuesPath, { token }),
        apiRequest(lowStockPath, { token }),
        apiRequest(stockSummaryPath, { token }),
      ])
      let detailedPath =
        stockReportPeriod === 'range'
          ? `/api/reports/stock-detailed?period=range&from=${encodeURIComponent(stockReportFrom)}&to=${encodeURIComponent(stockReportTo)}`
          : `/api/reports/stock-detailed?period=${stockReportPeriod}`
      if (profile?.role === 'General Manager') {
        if (stockReportScope === 'company') detailedPath += '&view=company'
        else detailedPath += `&view=branch&branchId=${encodeURIComponent(stockReportBranchId)}`
      } else {
        detailedPath += '&view=branch'
      }
      const detailedData = await apiRequest(detailedPath, { token })
      setIssuedReportRows(issuesData.rows || [])
      setTotalIssuedFromReport(issuesData.totalIssued || 0)
      setLowStockRows(lowStockData.rows || [])
      setStockSummaryRows(summaryData.rows || [])
      setDetailedLedgerRows(detailedData.ledger || [])
      setDetailedClaimsRows(detailedData.claims || [])
      setDetailedReceiptsRows(detailedData.receipts || [])
      setOpeningBalanceReport(Number(detailedData.openingBalance || 0))
      setClosingBalanceReport(Number(detailedData.closingBalance || 0))
    } catch (reportError) {
      setError(reportError.message)
    }
  }, [profile, stockReportBranchId, stockReportFrom, stockReportPeriod, stockReportScope, stockReportTo])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const activeSession = data.session ?? null
      setSession(activeSession)
      if (activeSession) {
        void loadDashboardData(activeSession.access_token)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        void loadDashboardData(nextSession.access_token)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadDashboardData])

  const handleLogin = async (event) => {
    event.preventDefault()
    resetFeedback()
    setLoading(true)

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })

    if (loginError) setError(loginError.message)
    else setMessage('Logged in successfully.')

    setLoading(false)
  }

  const handleSignUp = async (event) => {
    event.preventDefault()
    resetFeedback()
    setLoading(true)

    try {
      const response = await apiRequest('/api/auth/signup', {
        method: 'POST',
        body: {
          email,
          password,
          username,
          city,
          physicalAddress,
        },
      })

      if (response.isSystemAdministrator) {
        setMessage('System Administrator account created. Please login and reset your password.')
      } else {
        setMessage('Account created and pending System Administrator approval.')
      }
      setMode('login')
      setLoginEmail(email)
      setLoginPassword('')
      setUsername('')
      setEmail('')
      setPassword('')
      setCity('')
      setPhysicalAddress('')
    } catch (signUpError) {
      setError(signUpError.message)
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    resetFeedback()
    setLoading(true)
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
    else {
      setProfile(null)
      setMessage('Logged out.')
    }
    setLoading(false)
  }

  const handleCreateUser = async (event) => {
    event.preventDefault()
    if (!session) return
    resetFeedback()
    setLoading(true)
    try {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        token: session.access_token,
        body: {
          email: createUserEmail,
          password: createUserPassword,
          username: createUserUsername,
          city: createUserCity,
          physicalAddress: createUserPhysicalAddress,
          role: createUserRole,
          branchId: createUserBranchId || null,
        },
      })
      setMessage('User created and approved.')
      setCreateUserEmail('')
      setCreateUserPassword('')
      setCreateUserUsername('')
      setCreateUserCity('')
      setCreateUserPhysicalAddress('')
      setCreateUserRole('Policy Holder')
      setCreateUserBranchId('')
      await loadAdminUsers(session.access_token)
    } catch (createError) {
      setError(createError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleApproveAndAssign = async (
    userId,
    isApproved,
    roleValue,
    branchIdValue,
    mustResetPassword,
  ) => {
    if (!session) return
    resetFeedback()
    setLoading(true)
    try {
      await apiRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        token: session.access_token,
        body: {
          isApproved,
          role: roleValue,
          branchId: branchIdValue || null,
          mustResetPassword,
        },
      })
      setMessage('User updated successfully.')
      await loadAdminUsers(session.access_token)
    } catch (updateError) {
      setError(updateError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!session) return
    resetFeedback()
    setLoading(true)
    try {
      await apiRequest(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        token: session.access_token,
      })
      setMessage('User deleted.')
      await loadAdminUsers(session.access_token)
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleResetMyPassword = async (event) => {
    event.preventDefault()
    if (!session) return
    resetFeedback()
    if (resetPassword !== resetPasswordConfirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await apiRequest('/api/me/password', {
        method: 'PATCH',
        token: session.access_token,
        body: { newPassword: resetPassword },
      })
      setResetPassword('')
      setResetPasswordConfirm('')
      setMessage('Password reset successful.')
      await loadDashboardData(session.access_token)
    } catch (resetError) {
      setError(resetError.message)
    } finally {
      setLoading(false)
    }
  }

  const getAdminEdit = (u) => {
    return (
      adminEdits[u.user_id] || {
        role: u.role,
        branchId: u.branch_id || '',
        approved: u.is_approved,
        mustResetPassword: u.must_reset_password ?? false,
      }
    )
  }

  const handleReceiveStock = async (event) => {
    event.preventDefault()
    if (!session) return

    resetFeedback()
    setLoading(true)
    try {
      await apiRequest('/api/stock/receive', {
        method: 'POST',
        token: session.access_token,
        body: {
          branchId: receiveBranchId,
          casketTypeId: receiveCasketTypeId,
          quantity: Number(receiveQuantity),
          notes: receiveNotes,
        },
      })
      setMessage('Stock received successfully.')
      setReceiveQuantity(1)
      setReceiveNotes('')
      await loadDashboardData(session.access_token)
    } catch (receiveError) {
      setError(receiveError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleIssueCasket = async (event) => {
    event.preventDefault()
    if (!session) return

    resetFeedback()
    setLoading(true)
    try {
      await apiRequest('/api/claims/issue', {
        method: 'POST',
        token: session.access_token,
        body: {
          policyNumber: issuePolicyNumber,
          policyHolderName: issuePolicyHolderName,
          branchId: issueBranchId,
          casketTypeId: issueCasketTypeId,
          quantity: Number(issueQuantity),
          notes: issueNotes,
        },
      })
      setMessage('Casket issued against claim.')
      setIssuePolicyNumber('')
      setIssuePolicyHolderName('')
      setIssueQuantity(1)
      setIssueNotes('')
      await loadDashboardData(session.access_token)
    } catch (issueError) {
      setError(issueError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitClaimRequest = async (event) => {
    event.preventDefault()
    if (!session) return

    resetFeedback()
    if (!POLICY_NUMBER_REGEX.test(String(claimPolicyNumber).toUpperCase())) {
      setError('Policy number must be in format D00001A')
      return
    }
    setLoading(true)
    try {
      await apiRequest('/api/policy-holder/claims', {
        method: 'POST',
        token: session.access_token,
        body: {
          policyNumber: claimPolicyNumber,
          policyHolderName: claimPolicyHolderName,
          branchId: claimBranchId,
          requestedCasketTypeId: claimRequestedCasketTypeId,
          requestedQuantity: Number(claimRequestedQuantity),
          notes: claimNotes,
        },
      })
      setMessage('Claim request submitted successfully.')
      setClaimPolicyNumber('')
      setClaimPolicyHolderName('')
      setClaimRequestedQuantity(1)
      setClaimNotes('')
      await loadPolicyHolderClaims(session.access_token)
      setActiveTab('my-claims')
    } catch (claimError) {
      setError(claimError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitStockReceipt = async (event) => {
    event.preventDefault()
    if (!session) return
    resetFeedback()
    if (!receiptFile) {
      setError('Please attach a delivery note or GRV.')
      return
    }

    setLoading(true)
    try {
      const signedUploadData = await apiRequest('/api/storage/signed-upload', {
        method: 'POST',
        token: session.access_token,
        body: { fileName: receiptFile.name },
      })

      const { error: uploadError } = await supabase.storage
        .from('supporting-documents')
        .uploadToSignedUrl(signedUploadData.path, signedUploadData.token, receiptFile)
      if (uploadError) throw uploadError

      await apiRequest('/api/stock-receipts', {
        method: 'POST',
        token: session.access_token,
        body: {
          items: casketTypes
            .map((type) => ({
              casketTypeId: type.id,
              quantity: Number(receiptItemQuantities[type.id] || 0),
            }))
            .filter((item) => item.quantity > 0),
          deliveryNoteUrl: signedUploadData.publicUrl,
          deliveryNoteName: receiptFile.name,
          notes: receiptNotes,
        },
      })
      setMessage('Receipt submitted for branch manager approval.')
      setReceiptItemQuantities(
        Object.fromEntries(casketTypes.map((type) => [type.id, ''])),
      )
      setReceiptNotes('')
      setReceiptFile(null)
      await loadDashboardData(session.access_token)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClerkClaimReview = async (claimId, decision) => {
    if (!session) return
    resetFeedback()
    setLoading(true)
    try {
      await apiRequest(`/api/claims/${claimId}/clerk-review`, {
        method: 'PATCH',
        token: session.access_token,
        body: { decision },
      })
      setMessage(`Claim ${decision === 'approve' ? 'approved' : 'rejected'} by Stores Clerk.`)
      await loadClerkClaims(session.access_token)
      await loadDashboardData(session.access_token)
    } catch (reviewError) {
      setError(reviewError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleManagerClaimReview = async (claimId, decision) => {
    if (!session) return
    resetFeedback()
    setLoading(true)
    try {
      await apiRequest(`/api/claims/${claimId}/manager-review`, {
        method: 'PATCH',
        token: session.access_token,
        body: { decision },
      })
      setMessage(
        decision === 'approve'
          ? 'Claim approved by manager and stock dispatched.'
          : 'Claim rejected by manager.',
      )
      await loadManagerClaims(session.access_token)
      await loadManagerReports(session.access_token)
      await loadPendingManagerReceipts(session.access_token)
      await loadDashboardData(session.access_token)
    } catch (reviewError) {
      setError(reviewError.message)
    } finally {
      setLoading(false)
    }
  }

  if (session) {
    const isAdmin = profile?.role === 'System Administrator'
    const isPolicyHolder = profile?.role === 'Policy Holder'
    const isStoresClerk = profile?.role === 'Stores Clerk'
    const isGeneralManager = profile?.role === 'General Manager'
    const isBranchManager = profile?.role === 'Branch Manager'
    const isManager = isGeneralManager || isBranchManager
    const mustResetPassword = Boolean(profile?.must_reset_password)
    const adminPendingUsers = adminUsers.filter((u) => !u.is_approved).length

    return (
      <main className="app-shell">
        <header className="app-topbar">
          <div className="topbar-left">
            <strong>Doves Holdings</strong>
            <span>
              {isAdmin
                ? 'System Admin Portal'
                : isPolicyHolder
                  ? 'Policy Holder Portal'
                  : isGeneralManager
                    ? 'General Manager Portal'
                    : isBranchManager
                      ? 'Branch Manager Portal'
                      : 'Stock Operations Portal'}
            </span>
          </div>
          <div className="topbar-right">
            <span className="user-chip">
              {session.user.email}
              {profile?.role ? ` • ${profile.role}` : ''}
            </span>
            <button type="button" className="secondary-btn" onClick={handleLogout} disabled={loading}>
              {loading ? 'Please wait...' : 'Log out'}
            </button>
          </div>
        </header>
        <section className="app-content">
          <div className="auth-card dashboard-card">
            <div className="dashboard-header">
              <div>
                <h2>{isAdmin ? 'System Administrator Dashboard' : 'Operations Dashboard'}</h2>
                <p className="muted">Welcome back. Here is your system overview.</p>
              </div>
            </div>

            <nav className="top-nav">
              <button
                type="button"
                className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  className={`nav-btn ${activeTab === 'users' ? 'active' : ''}`}
                  onClick={() => setActiveTab('users')}
                >
                  Users
                </button>
              ) : isPolicyHolder ? (
                <>
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'my-claims' ? 'active' : ''}`}
                    onClick={() => setActiveTab('my-claims')}
                  >
                    My Claims
                  </button>
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'new-claim' ? 'active' : ''}`}
                    onClick={() => setActiveTab('new-claim')}
                  >
                    Submit Claim
                  </button>
                </>
              ) : isStoresClerk ? (
                <>
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'clerk-claims' ? 'active' : ''}`}
                    onClick={() => setActiveTab('clerk-claims')}
                  >
                    Claim Approvals
                  </button>
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'clerk-receipts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('clerk-receipts')}
                  >
                    Record Received Caskets
                  </button>
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'stock-reports' ? 'active' : ''}`}
                    onClick={() => setActiveTab('stock-reports')}
                  >
                    Stock Reports
                  </button>
                </>
              ) : isBranchManager ? (
                <>
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'manager-claims' ? 'active' : ''}`}
                    onClick={() => setActiveTab('manager-claims')}
                  >
                    Manager Approvals
                  </button>
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'stock-reports' ? 'active' : ''}`}
                    onClick={() => setActiveTab('stock-reports')}
                  >
                    Stock Reports
                  </button>
                </>
              ) : isGeneralManager ? (
                <button
                  type="button"
                  className={`nav-btn ${activeTab === 'gm-reports' ? 'active' : ''}`}
                  onClick={() => setActiveTab('gm-reports')}
                >
                  GM Reports
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'receive' ? 'active' : ''}`}
                    onClick={() => setActiveTab('receive')}
                  >
                    Receive Stock
                  </button>
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'dispatch' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dispatch')}
                  >
                    Dispatch/Issue
                  </button>
                </>
              )}
            </nav>

            {mustResetPassword ? (
              <section className="panel">
                <h3>Password Reset Required</h3>
                <p className="muted">
                  You must reset your password before you can continue using the system.
                </p>
                <form className="auth-form compact" onSubmit={handleResetMyPassword}>
                  <label htmlFor="reset-password">New Password</label>
                  <input
                    id="reset-password"
                    type="password"
                    minLength={6}
                    required
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                  />
                  <label htmlFor="reset-password-confirm">Confirm New Password</label>
                  <input
                    id="reset-password-confirm"
                    type="password"
                    minLength={6}
                    required
                    value={resetPasswordConfirm}
                    onChange={(event) => setResetPasswordConfirm(event.target.value)}
                  />
                  <button type="submit" className="primary-btn" disabled={loading}>
                    Reset Password
                  </button>
                </form>
              </section>
            ) : null}

            {!mustResetPassword ? (
              <>
                {activeTab === 'overview' ? (
                  <>
                    <section className="panel kpi-grid">
                      <article className="kpi-card">
                        <p className="kpi-label">
                          {isPolicyHolder
                            ? 'My claims'
                            : isStoresClerk
                              ? 'Pending clerk approvals'
                              : isManager
                                ? 'Pending manager approvals'
                                : 'Number of users'}
                        </p>
                        <h3>
                          {isPolicyHolder
                            ? myClaims.length
                            : isStoresClerk
                              ? pendingClerkClaims.length
                            : isManager
                              ? pendingManagerClaims.length
                              : isAdmin
                                ? adminUsers.length
                                : '-'}
                        </h3>
                      </article>
                      <article className="kpi-card">
                        <p className="kpi-label">
                          {isPolicyHolder
                            ? 'Approved/Issued claims'
                            : isStoresClerk
                              ? 'Submitted stock receipts'
                            : isManager
                              ? 'Total issued'
                              : 'Caskets available'}
                        </p>
                        <h3>
                          {isPolicyHolder
                            ? myClaims.filter((claim) => claim.status === 'issued').length
                            : isStoresClerk
                              ? '-'
                            : isManager
                              ? totalIssuedFromReport
                              : totalCasketsAvailable}
                        </h3>
                      </article>
                      <article className="kpi-card">
                        <p className="kpi-label">{isPolicyHolder ? 'Pending claims' : 'Branches'}</p>
                        <h3>
                          {isPolicyHolder
                            ? myClaims.filter((claim) => claim.status === 'pending').length
                            : branches.length}
                        </h3>
                      </article>
                      <article className="kpi-card">
                        <p className="kpi-label">
                          {isPolicyHolder
                            ? 'Rejected/Cancelled claims'
                            : isStoresClerk
                              ? 'Branch'
                              : isManager
                                ? 'Low stock items'
                                : 'Pending approvals'}
                        </p>
                        <h3>
                          {isPolicyHolder
                            ? myClaims.filter((claim) => claim.status === 'cancelled').length
                            : isStoresClerk
                              ? branches[0]?.code || '-'
                            : isManager
                              ? lowStockRows.length
                            : isAdmin
                              ? adminPendingUsers
                              : '-'}
                        </h3>
                      </article>
                    </section>
                    <section className="panel">
                      <h3>{isPolicyHolder ? 'My Recent Claims' : 'Current Stock Balances'}</h3>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              {isPolicyHolder ? (
                                <>
                                  <th>Policy #</th>
                                  <th>Branch</th>
                                  <th>Status</th>
                                  <th>Requested Qty</th>
                                </>
                              ) : (
                                <>
                                  <th>Branch</th>
                                  <th>Casket</th>
                                  <th>SKU</th>
                                  <th>Qty on hand</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {(isPolicyHolder ? myClaims : balances).length ? (
                              (isPolicyHolder ? myClaims : balances).map((row) => (
                                <tr key={row.id}>
                                  {isPolicyHolder ? (
                                    <>
                                      <td>{row.policy_number}</td>
                                      <td>{row.branch?.name}</td>
                                      <td>{row.status}</td>
                                      <td>{row.requested_quantity}</td>
                                    </>
                                  ) : (
                                    <>
                                      <td>{row.branch?.name}</td>
                                      <td>{row.casket_type?.name}</td>
                                      <td>{row.casket_type?.sku}</td>
                                      <td>{row.quantity_on_hand}</td>
                                    </>
                                  )}
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4}>No stock records yet.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                ) : null}

                {!isAdmin && !isPolicyHolder && activeTab === 'receive' ? (
                  <section className="panel">
                    <h3>Receive Stock</h3>
                    <form className="auth-form compact" onSubmit={handleReceiveStock}>
                      <label htmlFor="receive-branch">Branch</label>
                      <select
                        id="receive-branch"
                        value={receiveBranchId}
                        onChange={(event) => setReceiveBranchId(event.target.value)}
                        required
                      >
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>

                      <label htmlFor="receive-casket">Casket Type</label>
                      <select
                        id="receive-casket"
                        value={receiveCasketTypeId}
                        onChange={(event) => setReceiveCasketTypeId(event.target.value)}
                        required
                      >
                        {casketTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name} ({type.sku})
                          </option>
                        ))}
                      </select>

                      <label htmlFor="receive-quantity">Quantity</label>
                      <input
                        id="receive-quantity"
                        type="number"
                        min={1}
                        required
                        value={receiveQuantity}
                        onChange={(event) => setReceiveQuantity(event.target.value)}
                      />

                      <label htmlFor="receive-notes">Notes</label>
                      <input
                        id="receive-notes"
                        type="text"
                        value={receiveNotes}
                        onChange={(event) => setReceiveNotes(event.target.value)}
                      />

                      <button type="submit" className="primary-btn" disabled={loading}>
                        Receive Stock
                      </button>
                    </form>
                  </section>
                ) : null}

                {!isAdmin && !isPolicyHolder && !isStoresClerk && !isManager && activeTab === 'dispatch' ? (
                  <section className="panel">
                    <h3>Issue Casket to Claim</h3>
                    <form className="auth-form compact" onSubmit={handleIssueCasket}>
                      <label htmlFor="issue-policy-number">Policy Number</label>
                      <input
                        id="issue-policy-number"
                        type="text"
                        required
                        value={issuePolicyNumber}
                        onChange={(event) => setIssuePolicyNumber(event.target.value)}
                      />

                      <label htmlFor="issue-policy-holder-name">Policy Holder Name</label>
                      <input
                        id="issue-policy-holder-name"
                        type="text"
                        required
                        value={issuePolicyHolderName}
                        onChange={(event) => setIssuePolicyHolderName(event.target.value)}
                      />

                      <label htmlFor="issue-branch">Branch</label>
                      <select
                        id="issue-branch"
                        value={issueBranchId}
                        onChange={(event) => setIssueBranchId(event.target.value)}
                        required
                      >
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>

                      <label htmlFor="issue-casket-type">Casket Type</label>
                      <select
                        id="issue-casket-type"
                        value={issueCasketTypeId}
                        onChange={(event) => setIssueCasketTypeId(event.target.value)}
                        required
                      >
                        {casketTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name} ({type.sku})
                          </option>
                        ))}
                      </select>

                      <label htmlFor="issue-quantity">Quantity</label>
                      <input
                        id="issue-quantity"
                        type="number"
                        min={1}
                        required
                        value={issueQuantity}
                        onChange={(event) => setIssueQuantity(event.target.value)}
                      />

                      <label htmlFor="issue-notes">Notes</label>
                      <input
                        id="issue-notes"
                        type="text"
                        value={issueNotes}
                        onChange={(event) => setIssueNotes(event.target.value)}
                      />

                      <button type="submit" className="primary-btn" disabled={loading}>
                        Issue Casket
                      </button>
                    </form>
                  </section>
                ) : null}
              </>
            ) : null}

            {isStoresClerk && !mustResetPassword && activeTab === 'clerk-claims' ? (
              <section className="panel">
                <h3>Stores Clerk Claim Approvals</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Policy #</th>
                        <th>Policy Holder</th>
                        <th>Casket</th>
                        <th>Qty</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingClerkClaims.length ? (
                        pendingClerkClaims.map((claim) => (
                          <tr key={claim.id}>
                            <td>{new Date(claim.created_at).toLocaleDateString()}</td>
                            <td>{claim.policy_number}</td>
                            <td>{claim.policy_holder_name}</td>
                            <td>{claim.requested_casket_type?.name || '-'}</td>
                            <td>{claim.requested_quantity}</td>
                            <td className="action-cell">
                              <button
                                type="button"
                                className="secondary-btn"
                                disabled={loading}
                                onClick={() => handleClerkClaimReview(claim.id, 'approve')}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="danger-btn"
                                disabled={loading}
                                onClick={() => handleClerkClaimReview(claim.id, 'reject')}
                              >
                                Reject
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6}>No pending claims for clerk review.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {isStoresClerk && !mustResetPassword && activeTab === 'clerk-receipts' ? (
              <section className="panel">
                <h3>Record Received Caskets</h3>
                <p className="muted">Attach delivery note/GRV and submit for branch manager approval.</p>
                <form className="auth-form compact" onSubmit={handleSubmitStockReceipt}>
                  <h4 className="mini-title">Casket Quantities in this GRV</h4>
                  {casketTypes.map((type) => (
                    <div key={type.id} className="line-item-row">
                      <label htmlFor={`receipt-qty-${type.id}`}>
                        {type.name} ({type.sku})
                      </label>
                      <input
                        id={`receipt-qty-${type.id}`}
                        type="number"
                        min={0}
                        value={receiptItemQuantities[type.id] ?? ''}
                        onChange={(event) =>
                          setReceiptItemQuantities((prev) => ({
                            ...prev,
                            [type.id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}

                  <label htmlFor="receipt-file">Delivery Note / GRV</label>
                  <input
                    id="receipt-file"
                    type="file"
                    required
                    onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
                  />

                  <label htmlFor="receipt-notes">Notes</label>
                  <input
                    id="receipt-notes"
                    type="text"
                    value={receiptNotes}
                    onChange={(event) => setReceiptNotes(event.target.value)}
                  />

                  <button type="submit" className="primary-btn" disabled={loading}>
                    Submit for Approval
                  </button>
                </form>
              </section>
            ) : null}

            {isBranchManager && !mustResetPassword && activeTab === 'manager-claims' ? (
              <>
                <section className="panel">
                  <h3>Claim Approvals (Second Stage)</h3>
                  <p className="muted">
                    Claims here are already approved by Stores Clerk. Stock changes only when you approve.
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Policy #</th>
                          <th>Policy Holder</th>
                          <th>Casket</th>
                          <th>Qty</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingManagerClaims.length ? (
                          pendingManagerClaims.map((claim) => (
                            <tr key={claim.id}>
                              <td>{new Date(claim.created_at).toLocaleDateString()}</td>
                              <td>{claim.policy_number}</td>
                              <td>{claim.policy_holder_name}</td>
                              <td>{claim.requested_casket_type?.name || '-'}</td>
                              <td>{claim.requested_quantity}</td>
                              <td className="action-cell">
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  disabled={loading}
                                  onClick={() => handleManagerClaimReview(claim.id, 'approve')}
                                >
                                  Approve + Dispatch
                                </button>
                                <button
                                  type="button"
                                  className="danger-btn"
                                  disabled={loading}
                                  onClick={() => handleManagerClaimReview(claim.id, 'reject')}
                                >
                                  Reject
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6}>No pending claims for manager review.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="panel">
                  <h3>Received Casket Approval</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Branch</th>
                          <th>Items</th>
                          <th>GRV / Delivery Note</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingManagerReceipts.length ? (
                          pendingManagerReceipts.map((receipt) => (
                            <tr key={receipt.id}>
                              <td>{new Date(receipt.created_at).toLocaleDateString()}</td>
                              <td>{receipt.branch?.name}</td>
                              <td>{receipt.items?.length || 0} item(s)</td>
                              <td>
                                <a href={receipt.delivery_note_url} target="_blank" rel="noreferrer">
                                  {receipt.delivery_note_name}
                                </a>
                              </td>
                              <td className="action-cell">
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => setSelectedReceipt(receipt)}
                                >
                                  View Details
                                </button>
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  disabled={loading}
                                  onClick={async () => {
                                    if (!session) return
                                    setLoading(true)
                                    try {
                                      await apiRequest(`/api/stock-receipts/${receipt.id}/manager-review`, {
                                        method: 'PATCH',
                                        token: session.access_token,
                                        body: { decision: 'approve' },
                                      })
                                      setMessage('Receipt approved and stock updated.')
                                      await loadPendingManagerReceipts(session.access_token)
                                      await loadDashboardData(session.access_token)
                                    } catch (e) {
                                      setError(e.message)
                                    } finally {
                                      setLoading(false)
                                    }
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="danger-btn"
                                  disabled={loading}
                                  onClick={async () => {
                                    if (!session) return
                                    setLoading(true)
                                    try {
                                      await apiRequest(`/api/stock-receipts/${receipt.id}/manager-review`, {
                                        method: 'PATCH',
                                        token: session.access_token,
                                        body: { decision: 'reject' },
                                      })
                                      setMessage('Receipt rejected.')
                                      await loadPendingManagerReceipts(session.access_token)
                                    } catch (e) {
                                      setError(e.message)
                                    } finally {
                                      setLoading(false)
                                    }
                                  }}
                                >
                                  Reject
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5}>No pending stock receipts.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}

            {(isGeneralManager && !mustResetPassword && activeTab === 'gm-reports') ||
            ((isStoresClerk || isBranchManager) && !mustResetPassword && activeTab === 'stock-reports') ? (
              <>
                <section className="panel">
                  <h3>Stock Report Filters</h3>
                  <form
                    className="auth-form compact"
                    onSubmit={async (event) => {
                      event.preventDefault()
                      if (!session) return
                      await loadManagerReports(session.access_token)
                    }}
                  >
                    <label htmlFor="stock-report-period">Period</label>
                    <select
                      id="stock-report-period"
                      value={stockReportPeriod}
                      onChange={(event) => setStockReportPeriod(event.target.value)}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="range">Custom date range</option>
                    </select>
                    {isGeneralManager ? (
                      <>
                        <label htmlFor="stock-report-scope">Scope</label>
                        <select
                          id="stock-report-scope"
                          value={stockReportScope}
                          onChange={(event) => setStockReportScope(event.target.value)}
                        >
                          <option value="company">Company (all branches)</option>
                          <option value="branch">Single branch</option>
                        </select>
                        {stockReportScope === 'branch' ? (
                          <>
                            <label htmlFor="stock-report-branch">Branch</label>
                            <select
                              id="stock-report-branch"
                              value={stockReportBranchId}
                              onChange={(event) => setStockReportBranchId(event.target.value)}
                            >
                              {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                  {branch.name}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : null}
                      </>
                    ) : null}
                    {stockReportPeriod === 'range' ? (
                      <>
                        <label htmlFor="stock-report-from">From</label>
                        <input
                          id="stock-report-from"
                          type="date"
                          required
                          value={stockReportFrom}
                          onChange={(event) => setStockReportFrom(event.target.value)}
                        />
                        <label htmlFor="stock-report-to">To</label>
                        <input
                          id="stock-report-to"
                          type="date"
                          required
                          value={stockReportTo}
                          onChange={(event) => setStockReportTo(event.target.value)}
                        />
                      </>
                    ) : null}
                    <button type="submit" className="secondary-btn" disabled={loading}>
                      Run Report
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={loading}
                      onClick={() => {
                        const doc = new jsPDF()
                        doc.setFontSize(14)
                        doc.text('Doves Holdings - Stock Report', 14, 14)
                        doc.setFontSize(10)
                        doc.text(
                          `Period: ${stockReportPeriod}${stockReportPeriod === 'range' ? ` (${stockReportFrom} to ${stockReportTo})` : ''}`,
                          14,
                          20,
                        )

                        let cursorY = 26

                        autoTable(doc, {
                          startY: cursorY,
                          head: [['Opening Balance (start date)', 'Closing Balance (end date)']],
                          body: [[String(openingBalanceReport), String(closingBalanceReport)]],
                        })
                        cursorY = doc.lastAutoTable.finalY + 8

                        autoTable(doc, {
                          startY: cursorY,
                          head: [['Branch', 'Casket', 'Stock In', 'Stock Out', 'Net']],
                          body: stockSummaryRows.map((row) => [
                            row.branch?.name || '-',
                            row.casket_type?.name || '-',
                            String(row.in_qty),
                            String(row.out_qty),
                            String(row.net),
                          ]),
                        })
                        cursorY = doc.lastAutoTable.finalY + 8

                        autoTable(doc, {
                          startY: cursorY,
                          head: [['Date', 'Description', 'Branch']],
                          body: detailedLedgerRows.map((row) => [
                            new Date(row.date).toLocaleDateString(),
                            row.description,
                            row.branch?.name || '-',
                          ]),
                        })
                        cursorY = doc.lastAutoTable.finalY + 8

                        autoTable(doc, {
                          startY: cursorY,
                          head: [['Date', 'Policy #', 'Policy Holder', 'Claimed By']],
                          body: detailedClaimsRows.map((row) => [
                            new Date(row.date).toLocaleDateString(),
                            row.policy_number,
                            row.policy_holder_name,
                            row.claimed_by,
                          ]),
                        })
                        cursorY = doc.lastAutoTable.finalY + 8

                        autoTable(doc, {
                          startY: cursorY,
                          head: [['Date', 'Document', 'Received By', 'Branch']],
                          body: detailedReceiptsRows.map((row) => [
                            new Date(row.date).toLocaleDateString(),
                            row.delivery_note_name,
                            row.received_by,
                            row.branch?.name || '-',
                          ]),
                        })

                        doc.save(`stock-report-${stockReportPeriod}.pdf`)
                      }}
                    >
                      Export PDF
                    </button>
                  </form>
                </section>
                <section className="panel">
                  <h3>Issued Claims Report</h3>
                  <p className="muted">Total issued caskets: {totalIssuedFromReport}</p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Branch</th>
                          <th>Casket Type</th>
                          <th>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {issuedReportRows.length ? (
                          issuedReportRows.map((row) => (
                            <tr key={row.id}>
                              <td>{new Date(row.issued_at).toLocaleDateString()}</td>
                              <td>{row.branch?.name}</td>
                              <td>{row.casket_type?.name}</td>
                              <td>{row.quantity}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4}>No issued claims yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="panel">
                  <h3>Low Stock (threshold: 5)</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Branch</th>
                          <th>Casket</th>
                          <th>SKU</th>
                          <th>Qty on hand</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStockRows.length ? (
                          lowStockRows.map((row) => (
                            <tr key={row.id}>
                              <td>{row.branch?.name}</td>
                              <td>{row.casket_type?.name}</td>
                              <td>{row.casket_type?.sku}</td>
                              <td>{row.quantity_on_hand}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4}>No low stock items.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="panel">
                  <h3>Stock Summary</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Branch</th>
                          <th>Casket</th>
                          <th>Stock In</th>
                          <th>Stock Out</th>
                          <th>Net Movement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockSummaryRows.length ? (
                          stockSummaryRows.map((row, idx) => (
                            <tr key={`${row.branch?.id || 'na'}-${row.casket_type?.id || idx}`}>
                              <td>{row.branch?.name || '-'}</td>
                              <td>{row.casket_type?.name || '-'}</td>
                              <td>{row.in_qty}</td>
                              <td>{row.out_qty}</td>
                              <td>{row.net}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5}>No stock movement data for selected period.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="panel">
                  <h3>Opening / Closing Balance</h3>
                  <div className="kpi-grid">
                    <article className="kpi-card">
                      <p className="kpi-label">Opening balance (start date)</p>
                      <h3>{openingBalanceReport}</h3>
                    </article>
                    <article className="kpi-card">
                      <p className="kpi-label">Closing balance (end date)</p>
                      <h3>{closingBalanceReport}</h3>
                    </article>
                  </div>
                </section>
                <section className="panel">
                  <h3>Stock Ledger</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Branch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedLedgerRows.length ? (
                          detailedLedgerRows.map((row) => (
                            <tr key={row.id}>
                              <td>{new Date(row.date).toLocaleDateString()}</td>
                              <td>{row.description}</td>
                              <td>{row.branch?.name || '-'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3}>No stock ledger entries for selected period.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="panel">
                  <h3>Claims Made</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Policy #</th>
                          <th>Policy Holder</th>
                          <th>Claimed By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedClaimsRows.length ? (
                          detailedClaimsRows.map((row) => (
                            <tr key={row.id}>
                              <td>{new Date(row.date).toLocaleDateString()}</td>
                              <td>{row.policy_number}</td>
                              <td>{row.policy_holder_name}</td>
                              <td>{row.claimed_by}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4}>No claims in selected period.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="panel">
                  <h3>Receipts of Caskets</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Document</th>
                          <th>Received By</th>
                          <th>Branch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedReceiptsRows.length ? (
                          detailedReceiptsRows.map((row) => (
                            <tr key={row.id}>
                              <td>{new Date(row.date).toLocaleDateString()}</td>
                              <td>{row.delivery_note_name}</td>
                              <td>{row.received_by}</td>
                              <td>{row.branch?.name || '-'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4}>No receipts in selected period.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}

            {selectedReceipt ? (
              <div className="modal-backdrop" onClick={() => setSelectedReceipt(null)}>
                <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Receipt Details</h3>
                    <button type="button" className="secondary-btn" onClick={() => setSelectedReceipt(null)}>
                      Close
                    </button>
                  </div>
                  <p className="muted">
                    Branch: {selectedReceipt.branch?.name} | Document:{' '}
                    <a href={selectedReceipt.delivery_note_url} target="_blank" rel="noreferrer">
                      {selectedReceipt.delivery_note_name}
                    </a>
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Casket Type</th>
                          <th>SKU</th>
                          <th>Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedReceipt.items || []).map((item) => (
                          <tr key={item.id}>
                            <td>{item.casket_type?.name}</td>
                            <td>{item.casket_type?.sku}</td>
                            <td>{item.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {isPolicyHolder && !mustResetPassword && activeTab === 'my-claims' ? (
              <section className="panel">
                <h3>My Claims</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Policy #</th>
                        <th>Casket</th>
                        <th>Qty</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myClaims.length ? (
                        myClaims.map((claim) => (
                          <tr key={claim.id}>
                            <td>{new Date(claim.created_at).toLocaleDateString()}</td>
                            <td>{claim.policy_number}</td>
                            <td>{claim.requested_casket_type?.name || '-'}</td>
                            <td>{claim.requested_quantity}</td>
                            <td>{claim.status}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>No claims submitted yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {isPolicyHolder && !mustResetPassword && activeTab === 'new-claim' ? (
              <section className="panel">
                <h3>Submit New Claim</h3>
                <form className="auth-form compact" onSubmit={handleSubmitClaimRequest}>
                  <label htmlFor="claim-policy-number">Policy Number</label>
                  <input
                    id="claim-policy-number"
                    type="text"
                    required
                    placeholder="D00001A"
                    value={claimPolicyNumber}
                    onChange={(event) => setClaimPolicyNumber(event.target.value)}
                  />

                  <label htmlFor="claim-policy-holder-name">Policy Holder Name</label>
                  <input
                    id="claim-policy-holder-name"
                    type="text"
                    required
                    value={claimPolicyHolderName}
                    onChange={(event) => setClaimPolicyHolderName(event.target.value)}
                  />

                  <label htmlFor="claim-branch">Branch</label>
                  <select
                    id="claim-branch"
                    value={claimBranchId}
                    onChange={(event) => setClaimBranchId(event.target.value)}
                    required
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="claim-casket-type">Requested Casket Type</label>
                  <select
                    id="claim-casket-type"
                    value={claimRequestedCasketTypeId}
                    onChange={(event) => setClaimRequestedCasketTypeId(event.target.value)}
                    required
                  >
                    {casketTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name} ({type.sku})
                      </option>
                    ))}
                  </select>

                  <label htmlFor="claim-qty">Requested Quantity</label>
                  <input
                    id="claim-qty"
                    type="number"
                    min={1}
                    required
                    value={claimRequestedQuantity}
                    onChange={(event) => setClaimRequestedQuantity(event.target.value)}
                  />

                  <label htmlFor="claim-notes">Notes</label>
                  <input
                    id="claim-notes"
                    type="text"
                    value={claimNotes}
                    onChange={(event) => setClaimNotes(event.target.value)}
                  />

                  <button type="submit" className="primary-btn" disabled={loading}>
                    Submit Claim
                  </button>
                </form>
              </section>
            ) : null}

            {isAdmin && !mustResetPassword && activeTab === 'users' ? (
              <>
                <section className="panel">
                  <h3>System Admin: Create User</h3>
                  <form className="auth-form compact" onSubmit={handleCreateUser}>
                    <label htmlFor="create-user-username">Username</label>
                    <input
                      id="create-user-username"
                      type="text"
                      required
                      value={createUserUsername}
                      onChange={(event) => setCreateUserUsername(event.target.value)}
                    />

                    <label htmlFor="create-user-email">Email</label>
                    <input
                      id="create-user-email"
                      type="email"
                      required
                      value={createUserEmail}
                      onChange={(event) => setCreateUserEmail(event.target.value)}
                    />

                    <label htmlFor="create-user-password">Temporary Password</label>
                    <input
                      id="create-user-password"
                      type="password"
                      required
                      minLength={6}
                      value={createUserPassword}
                      onChange={(event) => setCreateUserPassword(event.target.value)}
                    />

                    <label htmlFor="create-user-city">City</label>
                    <input
                      id="create-user-city"
                      type="text"
                      required
                      value={createUserCity}
                      onChange={(event) => setCreateUserCity(event.target.value)}
                    />

                    <label htmlFor="create-user-address">Physical Address</label>
                    <input
                      id="create-user-address"
                      type="text"
                      required
                      value={createUserPhysicalAddress}
                      onChange={(event) => setCreateUserPhysicalAddress(event.target.value)}
                    />

                    <label htmlFor="create-user-role">Role</label>
                    <select
                      id="create-user-role"
                      value={createUserRole}
                      onChange={(event) => setCreateUserRole(event.target.value)}
                      required
                    >
                      {roles.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {roleOption}
                        </option>
                      ))}
                    </select>

                    <label htmlFor="create-user-branch">Branch (optional)</label>
                    <select
                      id="create-user-branch"
                      value={createUserBranchId}
                      onChange={(event) => setCreateUserBranchId(event.target.value)}
                    >
                      <option value="">Not assigned</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>

                    <button type="submit" className="primary-btn" disabled={loading}>
                      Create User
                    </button>
                  </form>
                </section>

                <section className="panel">
                  <h3>System Admin: Users</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Approved</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((u) => (
                          <tr key={u.user_id}>
                            <td>{u.email || 'Unknown'}</td>
                            <td>
                              <select
                                value={getAdminEdit(u).role}
                                onChange={(event) =>
                                  setAdminEdits((prev) => ({
                                    ...prev,
                                    [u.user_id]: {
                                      ...getAdminEdit(u),
                                      role: event.target.value,
                                    },
                                  }))
                                }
                              >
                                {roles.map((roleOption) => (
                                  <option key={roleOption} value={roleOption}>
                                    {roleOption}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={getAdminEdit(u).approved}
                                onChange={(event) =>
                                  setAdminEdits((prev) => ({
                                    ...prev,
                                    [u.user_id]: {
                                      ...getAdminEdit(u),
                                      approved: event.target.checked,
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td className="action-cell">
                              <label className="inline-check">
                                <input
                                  type="checkbox"
                                  checked={
                                    adminEdits[u.user_id]?.mustResetPassword ??
                                    u.must_reset_password ??
                                    false
                                  }
                                  onChange={(event) =>
                                    setAdminEdits((prev) => ({
                                      ...prev,
                                      [u.user_id]: {
                                        ...getAdminEdit(u),
                                        mustResetPassword: event.target.checked,
                                      },
                                    }))
                                  }
                                />
                                Force reset
                              </label>
                              <select
                                value={getAdminEdit(u).branchId}
                                onChange={(event) =>
                                  setAdminEdits((prev) => ({
                                    ...prev,
                                    [u.user_id]: {
                                      ...getAdminEdit(u),
                                      branchId: event.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="">No branch</option>
                                {branches.map((branch) => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() =>
                                  handleApproveAndAssign(
                                    u.user_id,
                                    getAdminEdit(u).approved,
                                    getAdminEdit(u).role,
                                    getAdminEdit(u).branchId,
                                    adminEdits[u.user_id]?.mustResetPassword ??
                                      u.must_reset_password ??
                                      false,
                                  )
                                }
                                disabled={loading}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="danger-btn"
                                onClick={() => handleDeleteUser(u.user_id)}
                                disabled={loading}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}
            {message ? <p className="message success">{message}</p> : null}
            {error ? <p className="message error">{error}</p> : null}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <section className="brand-panel">
        <div className="brand-mark">Doves Holdings</div>
        <h1>Secure Access Portal</h1>
        <p>
          Sign in or create your account to manage policies, branches, stores, and administrative
          tasks.
        </p>
      </section>

      <section className="form-panel">
        <div className="auth-card">
          <div className="mode-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={`tab-btn ${isLogin ? 'active' : ''}`}
              onClick={() => {
                setMode('login')
                resetFeedback()
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={`tab-btn ${!isLogin ? 'active' : ''}`}
              onClick={() => {
                setMode('signup')
                resetFeedback()
              }}
            >
              Sign Up
            </button>
          </div>

          {isLogin ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <h2>Login</h2>
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />

              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />

              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleSignUp}>
              <h2>Create account</h2>
              <label htmlFor="signup-username">Username</label>
              <input
                id="signup-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />

              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <label htmlFor="signup-city">City</label>
              <input
                id="signup-city"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />

              <label htmlFor="signup-physical-address">Physical Address</label>
              <input
                id="signup-physical-address"
                type="text"
                required
                value={physicalAddress}
                onChange={(e) => setPhysicalAddress(e.target.value)}
              />

              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Creating account...' : 'Sign Up'}
              </button>
            </form>
          )}

          {message ? <p className="message success">{message}</p> : null}
          {error ? <p className="message error">{error}</p> : null}
        </div>
      </section>
    </main>
  )
}

export default App
