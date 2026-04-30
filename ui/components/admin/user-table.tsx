'use client';

import { useState } from 'react';
import { Search, Crown, Mail, MailCheck, Check, X, ChevronLeft, ChevronRight, UserPlus, Gift, CreditCard, Trash2, RotateCcw } from 'lucide-react';
import { AddUserDialog } from './add-user-dialog';
import { DeleteUserDialog } from './delete-user-dialog';

interface User {
  id: number;
  email: string;
  emailVerified: boolean;
  role: string;
  manualPremium: boolean;
  hasStripeSubscription: boolean;
  subscriptionStatus: string | null;
  subscriptionEnd: string | null;
  stripeCustomerId: string | null;
  isPremium: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UserTableProps {
  initialUsers: User[];
  initialPagination: Pagination;
}

export function UserTable({ initialUsers, initialPagination }: UserTableProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [pagination, setPagination] = useState<Pagination>(initialPagination);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [refundingUserId, setRefundingUserId] = useState<number | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [deleteDialogUser, setDeleteDialogUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleUserCreated = (newUser: User) => {
    // Add new user to the top of the list
    setUsers([newUser, ...users]);
    setPagination({ ...pagination, total: pagination.total + 1 });
  };

  const handleUserDeleted = (deletedUserId: number) => {
    // Remove user from the list
    setUsers(users.filter(u => u.id !== deletedUserId));
    setPagination({ ...pagination, total: pagination.total - 1 });
  };

  const fetchUsers = async (page: number = 1, search: string = '') => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (search) params.set('search', search);

      const response = await fetch(`/api/admin/users?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1, searchQuery);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchUsers(newPage, searchQuery);
    }
  };

  const togglePremium = async (userId: number, currentStatus: boolean) => {
    setUpdatingUserId(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/premium`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualPremium: !currentStatus })
      });

      if (response.ok) {
        // Update local state
        setUsers(users.map(u =>
          u.id === userId
            ? { ...u, manualPremium: !currentStatus, isPremium: !currentStatus || u.hasStripeSubscription }
            : u
        ));
      }
    } catch (error) {
      console.error('Failed to toggle premium:', error);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const refundLatestPayment = async (user: User) => {
    const confirmed = window.confirm(
      `Refund the latest paid Stripe invoice for ${user.email}? This does not cancel the subscription.`
    );

    if (!confirmed) return;

    setNotice(null);
    setRefundingUserId(user.id);

    try {
      const response = await fetch(`/api/admin/users/${user.id}/refund`, {
        method: 'POST'
      });
      const data = await response.json();

      if (!response.ok) {
        setNotice({ type: 'error', message: data.error || 'Failed to refund payment' });
        return;
      }

      const amount = (data.refund.amount / 100).toLocaleString('en-US', {
        style: 'currency',
        currency: data.refund.currency.toUpperCase()
      });
      setNotice({ type: 'success', message: `Refund created for ${amount}.` });
    } catch (error) {
      setNotice({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setRefundingUserId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      {/* Search Bar & Add User Button */}
      <div className="flex gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-amber-500 text-background rounded-lg font-medium hover:bg-amber-400 transition-colors"
          >
            Search
          </button>
        </form>
        <button
          onClick={() => setIsAddDialogOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-400 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {notice && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
              : 'border-rose-500/20 bg-rose-500/10 text-rose-500'
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* Add User Dialog */}
      <AddUserDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onUserCreated={handleUserCreated}
      />

      {/* Delete User Dialog */}
      <DeleteUserDialog
        user={deleteDialogUser}
        isOpen={deleteDialogUser !== null}
        onClose={() => setDeleteDialogUser(null)}
        onDeleted={handleUserDeleted}
      />

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Subscription</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Joined</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/30 to-rose-500/30 flex items-center justify-center">
                          <span className="text-sm font-medium">
                            {user.email[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {user.email}
                            {user.role === 'admin' && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-rose-500/20 text-rose-500 font-medium">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {user.emailVerified ? (
                              <>
                                <MailCheck className="h-3 w-3 text-emerald-500" />
                                <span className="text-emerald-500">Verified</span>
                              </>
                            ) : (
                              <>
                                <Mail className="h-3 w-3" />
                                <span>Not verified</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {user.isPremium ? (
                        <div className="flex items-center gap-1.5">
                          <Crown className="h-4 w-4 text-amber-500" />
                          <span className="text-amber-500 font-medium">Premium</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Free</span>
                      )}
                    </td>

                    {/* Subscription */}
                    <td className="px-4 py-3">
                      {user.hasStripeSubscription ? (
                        <div className="text-sm">
                          <div className="flex items-center gap-1.5">
                            <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500 text-xs font-medium">
                              Paid • {user.subscriptionStatus}
                            </span>
                          </div>
                          {user.subscriptionEnd && (
                            <div className="text-xs text-muted-foreground mt-1 ml-5">
                              Until {formatDate(user.subscriptionEnd)}
                            </div>
                          )}
                        </div>
                      ) : user.manualPremium ? (
                        <div className="flex items-center gap-1.5">
                          <Gift className="h-3.5 w-3.5 text-amber-500" />
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 text-xs font-medium">
                            Gifted Access
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => togglePremium(user.id, user.manualPremium)}
                          disabled={updatingUserId === user.id}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            user.manualPremium
                              ? 'bg-rose-500/20 text-rose-500 hover:bg-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30'
                          } ${updatingUserId === user.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {updatingUserId === user.id ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : user.manualPremium ? (
                            <>
                              <X className="h-4 w-4" />
                              Revoke
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4" />
                              Grant Premium
                            </>
                          )}
                        </button>
                        {user.role !== 'admin' && (
                          <button
                            onClick={() => setDeleteDialogUser(user)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {user.hasStripeSubscription && (
                          <button
                            onClick={() => refundLatestPayment(user)}
                            disabled={refundingUserId === user.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-500 hover:bg-sky-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Refund latest Stripe payment"
                          >
                            {refundingUserId === user.id ? (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4" />
                                Refund
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1 || isLoading}
                className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages || isLoading}
                className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
