# Leaveflow

A responsive employee leave dashboard backed by Express and MongoDB Atlas.

## Run locally

1. Install dependencies: `npm install`
2. Create a local `.env` file with the required MongoDB, JWT, login, CORS, and API URL variables. Keep it private; do not commit it.
3. Start both apps: `npm run dev`
4. Open `http://localhost:5173`

During development, `npm run dev` uses nodemon to restart the API automatically when files under `server/` change. Use `npm run server` for a single production-style API process.

Without `MONGODB_URI`, the API runs with demo memory data so the UI can be explored immediately. With Atlas configured, requests are stored in the `leaves` collection and employees are stored in the `employees` collection. If the employee collection is empty, the API inserts the included starter employee records once.

## Login

The API uses JWT sessions. Set `JWT_SECRET`, `MANAGER_EMAIL`, `MANAGER_PASSWORD`, and `EMPLOYEE_PASSWORD` in `.env`. The default development credentials are `akshaykhot5899@gmail.com` / `Akshay@5899` for the manager and any seeded employee email / `leaveflow123` for employee access. Change these values before deployment.

## Behavior

- Employees can submit requests and cancel only pending requests.
- New employees can register from the login screen; registration creates a MongoDB employee record with a hashed password and signs them in immediately.
- Employees and managers can exchange messages from the dashboard; messages are stored in the `messages` collection and scoped by authenticated user.
- Managers can approve or reject only pending requests.
- Managers can view all employee records and leave requests after login.
- Employees can view only their own leave requests, submit new requests, and cancel their own pending requests.
- The employee directory displays department, role, used leave, and remaining allowance.
- MongoDB transitions use an atomic `status: Pending` filter, so repeated or concurrent actions return `409` instead of overwriting a decision.
- The client disables the active action, replaces the updated request in state immediately, and reloads after an API conflict/error to avoid stale data.

## Deploy To Vercel + Render

Push this repository to GitHub, then deploy the two services separately.

### 1. Deploy the API to Render

Create a new **Web Service** from the repository. Render can also use the included `render.yaml` Blueprint.

- Build command: `npm install`
- Start command: `npm run server` or `node server.js`
- Health check path: `/api/health`

Set these Render environment variables:

`MONGODB_URI` is your Atlas URI, `JWT_SECRET` is a long random secret, `MANAGER_EMAIL` and `MANAGER_PASSWORD` define manager login, `EMPLOYEE_PASSWORD` defines the seeded employee password, and `FRONTEND_URL` must be `https://leave-management-mauve.vercel.app` without a trailing slash.

Copy the Render service URL, such as `https://leaveflow-api.onrender.com`.

### 2. Deploy the client to Vercel

Import the same GitHub repository into Vercel. The included `vercel.json` configures Vite automatically.

Add this Vercel environment variable:

`VITE_API_URL=https://your-render-service.onrender.com/api`

Deploy or redeploy after adding the variable. Then set Render's `FRONTEND_URL` to `https://leave-management-mauve.vercel.app` so production CORS permits the browser requests.

### 3. Production checklist

- Rotate any Atlas credentials that were exposed during development.
- Use a strong `JWT_SECRET` and non-default manager/employee passwords.
- Add the Vercel domain to MongoDB Atlas Network Access if your Atlas policy requires it; the API server, not the browser, connects to MongoDB.
- Confirm Render's `/api/health` returns `database: mongodb`.
- Confirm employee login only returns that employee's leave records and manager login can load the employee directory.
