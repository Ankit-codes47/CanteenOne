# CanteenOne

CanteenOne is a campus canteen preorder platform for students and vendors. Students can browse cafeterias, filter menus, add items to a cart, place a preorder, and pick up their order using a pickup token. Vendors log in to a separate restricted dashboard where they can only view orders and stock for their own canteen.

This project is structured as a monorepo with a React frontend and an Express + MongoDB backend.

## Features

- Student-facing campus menu browsing and canteen selection
- Search and category filtering across each canteen menu
- Cart-based ordering with quantity updates and purchase notes
- Demo checkout flow with simulated payment capture
- Preorder timing options: 15, 30, and 45 minutes
- Pickup token generation for each order
- Separate vendor dashboard with role-based access control
- Vendor-only visibility into that canteen's orders and menu stock
- Stock toggling for individual menu items
- Order lifecycle management: new → accepted → preparing → ready → delivered
- MongoDB-backed sessions and password hashing
- Local fallback to a bundled MongoDB instance when no external connection string is provided

## Tech stack

- Frontend: React + Vite
- Styling: custom CSS via the app's stylesheet layer
- Backend: Express.js
- Database: MongoDB with Mongoose
- Authentication: session tokens with salted hashing using Node crypto
- Local development: concurrently-managed Vite + API + MongoDB startup

## Project structure

```text
.
├── client/
│   ├── index.html
│   ├── vendor.html
│   ├── public/
│   │   └── logos/
│   └── src/
│       ├── App.jsx
│       ├── VendorApp.jsx
│       ├── VendorDashboard.jsx
│       ├── main.jsx
│       ├── vendor-main.jsx
│       └── styles.css
├── server/
│   ├── package.json
│   └── src/
│       ├── app.js
│       ├── data.js
│       ├── index.js
│       └── models.js
├── scripts/
│   └── dev.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── .mongo-data/
```

## Prerequisites

- Node.js 18 or newer
- MongoDB Community Server locally, or a MongoDB Atlas connection string

If `MONGODB_URI` is not set in the root `.env` file, the app starts a local MongoDB instance using `.mongo-data/` automatically.

## Environment setup

Create a root `.env` file based on the template:

```bash
cp .env.example .env
```

Then set your value:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
```

Notes:

- Keep the real connection string private and do not commit `.env` to Git.
- If you do not set `MONGODB_URI`, the app falls back to `mongodb://127.0.0.1:27017/canteenone` and starts a local MongoDB process with `mongod --dbpath ./.mongo-data --bind_ip 127.0.0.1`.

## Running locally

Install dependencies:

```bash
npm install
```

Start the frontend, API, and database together:

```bash
npm run dev
```

This runs:

- Student app at http://localhost:5173
- Vendor workspace at http://localhost:5173/vendor.html
- API server at http://localhost:4000

To build the frontend bundle for production:

```bash
npm run build
```

To start the backend alone in production mode:

```bash
npm run start
```

## Student experience

The student site presents several campus canteens, including:

- Urban Vada Pav
- M.Coin
- Chaigaram Pocket Cafe
- KE7
- Mr. Sandwich

Students can:

- view each canteen's menu and details
- search for products
- filter by category
- add items to a cart
- sign up or log in with an email-based account
- place a preorder with a note and ready-time preference
- pay using the demo payment flow
- view their order history and pickup token
- submit item reviews and ratings

Menu prices are intentionally presented as ₹1 below the in-store counter price, as described in the app data model.

## Vendor experience

The vendor workspace is a separate access flow designed for canteen staff. Each vendor sees only their assigned canteen's menu and orders.

The vendor dashboard supports:

- sign-in with a vendor ID and password
- live order queue for their canteen
- status updates through the fulfillment flow
- stock in/out toggles on menu items
- pickup-token visibility and order details

## Demo vendor accounts

The backend seeds demo vendor accounts on startup if they are missing.

- Urban Vada Pav: `CTN-URBAN-01` / `urban1234`
- M.Coin: `CTN-MCOIN-01` / `mcoin1234`
- Chaigaram Pocket Cafe: `CTN-CHAIGARAM-01` / `chaigaram1234`
- KE7: `CTN-KE7-01` / `ke71234`
- Mr. Sandwich: `CTN-SANDWICH-01` / `sandwich1234`

These credentials are for demo use only. Change the passwords before using the app with real customers.

## Backend API overview

The Express app exposes the following key routes:

- `GET /api/health` — checks server health and database state
- `GET /api/shops` — returns all campus canteens and their menu data
- `GET /api/shops/:shopId` — fetches an individual canteen menu
- `POST /api/auth/register` — student registration
- `POST /api/auth/login` — sign-in for student or vendor accounts
- `GET /api/auth/me` — retrieves the authenticated user from the session token
- `POST /api/auth/logout` — invalidates the current session
- `POST /api/payments/demo` — creates a mock payment record
- `POST /api/orders` — creates a student order
- `GET /api/orders` — returns orders for a student or vendor scope
- `PATCH /api/orders/:orderId/status` — advances a vendor order through the queue
- `PATCH /api/vendor/products/:productId/stock` — toggles stock availability
- `GET /api/reviews` — reads reviews for a menu item
- `POST /api/reviews` — submits a student review

## Data model summary

The backend uses MongoDB documents for:

- `Account` — student and vendor account details, password hash, role, and assigned shop
- `ProductStock` — per shop/per menu-item stock state
- `Payment` — demo payment records
- `Order` — order metadata, items, payment receipt, token, and lifecycle status
- `Review` — product ratings and comments
- `Session` — secure token storage with expiry-based cleanup

## Deployment notes

This project is ready for deployment to a Node hosting environment or Vercel-style front-end deployment with backend support.

For Vercel:

1. Push the project to a GitHub repository.
2. Import the repo into Vercel with the project root set to the repo root.
3. Add `MONGODB_URI` in the Vercel environment variables.
4. Keep the database user restricted to the app database and use a strong password.
5. Deploy; both the student site (`/`) and vendor page (`/vendor.html`) are served from the app, while `/api/*` is routed to the API layer.

The app uses MongoDB-backed sessions so authentication works across serverless or stateless request contexts.

## Payment and production readiness

The checkout flow is intentionally a demo payment integration. It does not charge real money.

Before taking real customer payments, replace the mock payment route with a production payment provider such as Razorpay, Stripe, or another supported gateway.

## Security and privacy notes

- Do not commit `.env` values or production credentials.
- Vendor demo accounts are included for testing only.
- Session tokens are hashed before storage.
- Passwords are salted and verified with `scrypt`.

## Troubleshooting

- If the app cannot connect to MongoDB, verify your `.env` file and MongoDB service status.
- If local MongoDB is missing, install MongoDB Community Server and ensure the `mongod` binary is available in your PATH.
- If the App cannot start because a port is busy, stop the conflicting service or change the relevant port configuration.
- If you are using a remote Atlas cluster, confirm network access is allowed for the deployment environment.

## License

This project does not currently declare a license file. Check the repository settings or ask the project owner before reusing it commercially or publicly.

## Summary

CanteenOne is a complete demo of a campus canteen ordering flow: students browse and order, vendors manage canteens, and the app stores state in MongoDB with role-aware permissions. It is a strong starting point for a campus food ordering app, but it still needs a production payment integration and operational hardening before real-world deployment.
