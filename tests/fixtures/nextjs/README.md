# This is a SAMPLE Next.js project for testing envguard locally.
# Create these files in a test directory to see envguard in action.

# File: .env
DATABASE_URL=postgres://localhost/mydb
NEXTAUTH_SECRET=super_secret_key_here
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_APP_NAME=MyApp
STRIPE_SECRET_KEY=sk_test_abc123
UNUSED_ANALYTICS_KEY=ua-123456        # <-- envguard will flag this as DEAD
OLD_REDIS_URL=redis://localhost:6379  # <-- envguard will flag this as DEAD

# File: pages/index.tsx
# import { GetServerSideProps } from 'next'
#
# export default function Home({ data }) {
#   return <div>{process.env.NEXT_PUBLIC_API_URL}</div>  // healthy
# }
#
# export const getServerSideProps: GetServerSideProps = async () => {
#   const db = process.env.DATABASE_URL   // healthy
#   const key = process.env.STRIPE_SECRET_KEY  // healthy
#   const missing = process.env.SENDGRID_API_KEY  // <-- envguard flags MISSING
#   return { props: {} }
# }

# Run: npx envguard check . --framework nextjs
