import { createFileRoute } from '@tanstack/react-router'
import { Home } from './Landing Page'

export const Route = createFileRoute('/')({
  component: Home,
})
