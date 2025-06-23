'use client';

import { useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button'; // Assuming this path is correct
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'; // Assuming this path is correct

export default function ConsentPage() {
  const searchParams = useSearchParams();

  const clientName = searchParams.get('client_name');
  const scope = searchParams.get('scope');
  const authRequestId = searchParams.get('auth_request_id');
  const userId = searchParams.get('user_id') || 'test-user-id'; // Default to test-user-id if not provided

  if (!clientName || !authRequestId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Required information missing from request (client_name or auth_request_id).</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // A simple way to make scopes more readable
  const formattedScope = scope
    ? scope
        .split(/[\s,_]+/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(', ')
    : 'basic access to your account';

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <Card className="w-full max-w-lg shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="space-y-2 text-center border-b pb-6">
          <CardTitle className="text-3xl font-bold tracking-tight">Authorize Application</CardTitle>
          <CardDescription className="text-gray-600 text-base">
            The application <strong className="text-indigo-600">{clientName}</strong> is requesting
            access to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Permissions Requested:</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                <li>
                  Access and manage your <strong className="font-medium">{formattedScope}</strong>.
                </li>
                {/* Example: Add more details based on specific scopes if available */}
                {/* {scope?.includes("email") && <li>View your email address.</li>} */}
              </ul>
            </div>
          </div>

          <div className="text-sm text-gray-700 bg-slate-50 border border-slate-200 rounded-md p-4">
            <p>
              You are currently logged in as:{' '}
              <strong className="font-medium text-indigo-600">{userId}</strong>.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              If this is not you, please cancel and log in with the correct account.
            </p>
          </div>

          <p className="text-center font-medium text-gray-700 pt-2 text-base">
            Do you grant these permissions to{' '}
            <strong className="text-indigo-600">{clientName}</strong>?
          </p>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-6 pt-6 border-t">
          <form
            action="/api/v2/oauth/consent"
            method="POST"
            className="w-full sm:w-auto flex-grow sm:flex-grow-0"
          >
            <input type="hidden" name="auth_request_id" value={authRequestId} />
            <input type="hidden" name="client_name" value={clientName} />
            <input type="hidden" name="scope" value={scope || ''} />
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="action" value="deny" />
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="w-full border-gray-400 hover:bg-gray-100 text-gray-700"
            >
              Deny Access
            </Button>
          </form>
          <form
            action="/api/v2/oauth/consent"
            method="POST"
            className="w-full sm:w-auto flex-grow sm:flex-grow-0"
          >
            <input type="hidden" name="auth_request_id" value={authRequestId} />
            <input type="hidden" name="client_name" value={clientName} />
            <input type="hidden" name="scope" value={scope || ''} />
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="action" value="allow" />
            <Button
              type="submit"
              variant="default"
              size="lg"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Allow Access
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
