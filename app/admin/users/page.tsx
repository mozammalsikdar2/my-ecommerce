"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Plus, Shield, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type UserRole = "CUSTOMER" | "MODERATOR" | "ADMIN";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  _count: { orders: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUserRole(value: unknown): value is UserRole {
  return (
    value === "CUSTOMER" || value === "MODERATOR" || value === "ADMIN"
  );
}

function isUserRecord(value: unknown): value is UserRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    (typeof value.phone === "string" || value.phone === null) &&
    isUserRole(value.role) &&
    typeof value.isActive === "boolean" &&
    typeof value.twoFactorEnabled === "boolean" &&
    typeof value.createdAt === "string" &&
    isRecord(value._count) &&
    typeof value._count.orders === "number"
  );
}

async function fetchUsers(): Promise<UserRecord[]> {
  const response = await fetch("/api/admin/users", { cache: "no-store" });
  if (!response.ok) {
    let message = `Unable to load users (${response.status})`;
    try {
      const body: unknown = await response.json();
      if (isRecord(body) && typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // Keep the status-based message for non-JSON responses.
    }
    throw new Error(message);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every(isUserRecord)) {
    throw new Error("Users endpoint returned invalid data");
  }
  return data;
}

async function getApiError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Keep the status-based message for non-JSON responses.
  }
  return `Request failed (${response.status})`;
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>(
    {},
  );
  const [newStaff, setNewStaff] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "MODERATOR" as "MODERATOR" | "ADMIN",
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      try {
        const response = await fetch("/api/admin/users", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await getApiError(response));

        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isUserRecord)) {
          throw new Error("Users endpoint returned invalid data");
        }
        if (controller.signal.aborted) return;
        setUsers(data);
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load users",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadUsers();
    return () => controller.abort();
  }, []);

  const updateUser = async (
    id: string,
    payload: { role?: UserRole; isActive?: boolean; password?: string },
  ) => {
    setError(null);
    setFeedback(null);
    setUpdatingIds((current) => new Set(current).add(id));

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await getApiError(response));

      const refreshedUsers = await fetchUsers();
      setUsers(refreshedUsers);
      if (payload.password !== undefined) {
        setPasswordDrafts((current) => ({ ...current, [id]: "" }));
        setFeedback("User password updated and existing sessions revoked.");
      } else {
        setFeedback("User permissions updated.");
      }
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update user",
      );
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const createStaff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newStaff.name,
          email: newStaff.email,
          phone: newStaff.phone || undefined,
          password: newStaff.password,
          role: newStaff.role,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const data: unknown = await response.json();
      if (!isUserRecord(data)) {
        throw new Error("Users endpoint returned invalid data");
      }
      setUsers((current) => [data, ...current]);
      setNewStaff({
        name: "",
        email: "",
        phone: "",
        password: "",
        role: "MODERATOR",
      });
      setFeedback(`${data.role} account created.`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create staff account",
      );
    } finally {
      setCreating(false);
    }
  };

  const deleteUser = async (listedUser: UserRecord) => {
    if (!window.confirm(`Permanently delete ${listedUser.name}'s account?`)) {
      return;
    }
    setError(null);
    setFeedback(null);
    setUpdatingIds((current) => new Set(current).add(listedUser.id));
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(listedUser.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await getApiError(response));
      setUsers((current) =>
        current.filter((listed) => listed.id !== listedUser.id),
      );
      setFeedback(`${listedUser.name}'s account deleted.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete user",
      );
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(listedUser.id);
        return next;
      });
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href="/admin/settings"
        className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-black"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin Settings
      </Link>
      <div className="mb-6 flex items-center gap-2">
        <Shield className="h-6 w-6 text-teal-700" />
        <h1 className="text-2xl font-bold text-gray-900">
          Users &amp; Role Permissions
        </h1>
      </div>

      {feedback && (
        <div
          role="status"
          className="mb-4 rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-800"
        >
          {feedback}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={createStaff}
        className="mb-6 grid gap-4 rounded-xl border bg-white p-5 shadow-sm md:grid-cols-3"
      >
        <h2 className="text-lg font-bold md:col-span-3">
          Create moderator or admin account
        </h2>
        <label className="text-sm font-medium">
          Full name
          <input
            required
            minLength={2}
            maxLength={100}
            value={newStaff.name}
            onChange={(event) =>
              setNewStaff((current) => ({ ...current, name: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Email
          <input
            required
            type="email"
            maxLength={254}
            value={newStaff.email}
            onChange={(event) =>
              setNewStaff((current) => ({ ...current, email: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Phone (optional)
          <input
            type="tel"
            maxLength={32}
            value={newStaff.phone}
            onChange={(event) =>
              setNewStaff((current) => ({ ...current, phone: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Temporary password
          <input
            required
            type="password"
            minLength={8}
            maxLength={72}
            value={newStaff.password}
            onChange={(event) =>
              setNewStaff((current) => ({
                ...current,
                password: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Account role
          <select
            value={newStaff.role}
            onChange={(event) =>
              setNewStaff((current) => ({
                ...current,
                role: event.target.value === "ADMIN" ? "ADMIN" : "MODERATOR",
              }))
            }
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
          >
            <option value="MODERATOR">MODERATOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={creating}
          className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {creating ? "Creating..." : "Create staff account"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email / Phone</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">2FA</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Reset password</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((listedUser) => {
                const isUpdating = updatingIds.has(listedUser.id);
                const isSelf = listedUser.id === currentUser?.id;

                return (
                  <tr key={listedUser.id}>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {listedUser.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{listedUser.email}</div>
                      {listedUser.phone && (
                        <div className="text-xs text-gray-400">
                          {listedUser.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Role for ${listedUser.name}`}
                        value={listedUser.role}
                        disabled={isUpdating || isSelf}
                        onChange={(event) => {
                          const role = event.target.value;
                          if (isUserRole(role)) {
                            void updateUser(listedUser.id, { role });
                          }
                        }}
                        className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-60"
                      >
                        <option value="CUSTOMER">CUSTOMER</option>
                        <option value="MODERATOR">MODERATOR</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          listedUser.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {listedUser.isActive ? "Active" : "Blocked"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {listedUser.twoFactorEnabled ? "Enabled" : "Disabled"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {listedUser._count.orders}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-56 items-center gap-1">
                        <input
                          type="password"
                          minLength={8}
                          maxLength={72}
                          autoComplete="new-password"
                          aria-label={`New password for ${listedUser.name}`}
                          placeholder="New password"
                          value={passwordDrafts[listedUser.id] ?? ""}
                          onChange={(event) =>
                            setPasswordDrafts((current) => ({
                              ...current,
                              [listedUser.id]: event.target.value,
                            }))
                          }
                          disabled={isUpdating || isSelf}
                          className="w-36 rounded border px-2 py-1.5 text-xs disabled:opacity-60"
                        />
                        <button
                          type="button"
                          disabled={
                            isUpdating ||
                            isSelf ||
                            (passwordDrafts[listedUser.id] ?? "").length < 8
                          }
                          onClick={() =>
                            void updateUser(listedUser.id, {
                              password: passwordDrafts[listedUser.id],
                            })
                          }
                          aria-label={`Update password for ${listedUser.name}`}
                          className="rounded border p-1.5 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isUpdating || isSelf}
                          onClick={() =>
                            void updateUser(listedUser.id, {
                              isActive: !listedUser.isActive,
                            })
                          }
                          className="rounded border px-3 py-1 text-xs font-semibold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isUpdating
                            ? "Saving..."
                            : listedUser.isActive
                              ? "Block User"
                              : "Activate"}
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating || isSelf}
                          onClick={() => void deleteUser(listedUser)}
                          aria-label={`Delete ${listedUser.name}`}
                          className="rounded border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
