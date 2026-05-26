import { Loader, Stack, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import { AIAnalysisLogs } from "./features/ai-logs/AIAnalysisLogs";
import { AdminUsers } from "./features/admin-users/AdminUsers";
import { AuthEvents } from "./features/auth-events/AuthEvents";
import { BoardHomeRedirect, EmailBoardRoute } from "./features/boards/BoardHome";
import { Login } from "./features/auth/Login";
import { EmailEvents } from "./features/email-events/EmailEvents";
import { OperationalEvents } from "./features/ops-events/OperationalEvents";
import { fetchCurrentUser, logout } from "./features/emails/api";
import { EmailCreate } from "./features/emails/EmailCreate";
import type { AuthUser } from "./features/emails/types";
import { EmailReview } from "./features/review/EmailReview";

export default function App() {
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchCurrentUser,
    retry: false,
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.removeQueries();
      navigate("/");
    },
  });

  if (currentUserQuery.isLoading) {
    return (
      <Stack align="center" justify="center" h="100dvh">
        <Loader />
        <Text c="dimmed">Checking session</Text>
      </Stack>
    );
  }

  if (currentUserQuery.isError || !currentUserQuery.data) {
    return <Login />;
  }

  return (
    <Routes>
      <Route path="/ai-logs" element={<AIAnalysisLogs />} />
      <Route path="/auth-events" element={<AuthEvents />} />
      <Route
        path="/admin/users"
        element={<AdminUsers currentUserRole={currentUserQuery.data.role} />}
      />
      <Route path="/admin/email-events" element={<EmailEvents />} />
      <Route path="/admin/operational-events" element={<OperationalEvents />} />
      <Route
        path="/emails/new"
        element={<EmailCreate currentUserRole={currentUserQuery.data.role} />}
      />
      <Route
        path="/emails/:emailId/edit"
        element={<EmailFieldsEditorRoute />}
      />
      <Route
        path="/emails/:emailId/review"
        element={<EmailReviewRoute currentUserRole={currentUserQuery.data.role} />}
      />
      <Route
        path="/"
        element={<BoardHomeRedirect />}
      />
      <Route
        path="/boards/:boardKey"
        element={
          <EmailBoardRoute
            currentUser={currentUserQuery.data}
            isLoggingOut={logoutMutation.isPending}
            onLogout={() => logoutMutation.mutate()}
          />
        }
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

function EmailReviewRoute({
  currentUserRole,
}: {
  currentUserRole: AuthUser["role"];
}) {
  const { emailId } = useParams();
  return emailId ? (
    <EmailReview currentUserRole={currentUserRole} emailId={emailId} />
  ) : (
    <Navigate replace to="/" />
  );
}

function EmailFieldsEditorRoute() {
  const { emailId } = useParams();
  return emailId ? (
    <Navigate replace to={`/emails/${encodeURIComponent(emailId)}/review`} />
  ) : (
    <Navigate replace to="/" />
  );
}
