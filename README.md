# CanteenOne

A campus canteen preorder app. Students browse canteens, create an account, order ahead, and receive a pickup token. Each vendor has a separate website and can only view their own canteen’s orders and stock.

## Start the app

Requires Node.js 18+, MongoDB Community Server for local storage, or a MongoDB Atlas connection string.

```bash
npm install
npm run dev
```

Open the student website at http://localhost:5173. Open the separate vendor workspace at http://localhost:5173/vendor.html. When the root `.env` contains `MONGODB_URI`, the app uses that MongoDB database. Without it, the start command uses local MongoDB data in `.mongo-data/`.

Build the student and vendor websites:

```bash
npm run build
```

## Campus canteens

The student home page shows the five logos supplied for Urban Vada Pav, M.Coin, Chaigaram Pocket Cafe, KE7, and Mr. Sandwich. The menu photo belongs to KE7. The other uploaded menu photos are transcribed under Urban Vada Pav, M.Coin, Chaigaram Pocket Cafe, and Mr. Sandwich. Entries are listed at ₹1 below their entered counter price. The Urban menu photo is low resolution, so verify its item names and prices with the shop before launch.

Online menu prices are ₹1 below the counter prices entered for each item. Student accounts, salted password hashes, orders, comments, and ratings are stored in MongoDB. Vendor IDs and salted password hashes are also stored in MongoDB. The root `.env` file is ignored by Git; keep its connection string private.

## Vendor demo accounts

These accounts are created on server startup if their IDs are not already in the database. Change their passwords before using the app with real customers.

- Urban Vada Pav: `CTN-URBAN-01` / `urban1234`
- M.Coin: `CTN-MCOIN-01` / `mcoin1234`
- Chaigaram Pocket Cafe: `CTN-CHAIGARAM-01` / `chaigaram1234`
- KE7: `CTN-KE7-01` / `ke71234`
- Mr. Sandwich: `CTN-SANDWICH-01` / `sandwich1234`

## Payments

Checkout currently uses a simulated presentation payment. No real money is charged. Connect a payment provider before taking payments from customers.


## Publish with GitHub and Vercel

1. Push this project to a GitHub repository. Keep the repository private while it contains demo vendor account setup.
2. In Vercel, choose **Add New → Project**, import the GitHub repository, and keep the project root as the repository root.
3. Add `MONGODB_URI` in Vercel **Project Settings → Environment Variables** for Production (and Preview if desired). Use the same Atlas database as your local `.env`; never paste the URI into source code or commit `.env`.
4. In MongoDB Atlas, allow the Vercel deployment to reach the cluster. For a public demo, use a database user restricted to this app’s database and a strong password.
5. Deploy. Vercel builds both student (`/`) and vendor (`/vendor.html`) pages; API requests under `/api/*` run through the serverless Express function.

The deployment uses MongoDB-backed sessions so sign-ins work across serverless requests. Payment remains a demo simulation and does not charge money. The default vendor accounts are for demonstration only; change their passwords before inviting real customers.
