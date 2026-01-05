import { createFileRoute } from '@tanstack/react-router'
import { Home } from '../Components/Landing Page'

export const Route = createFileRoute('/')({
  component: Home,
})
