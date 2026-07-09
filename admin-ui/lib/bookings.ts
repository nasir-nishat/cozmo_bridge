import type { BookingEntry } from './types'

const LIVE_BOOKING_STATUSES = new Set(['BOOKED', 'PAID_IN_FULL', 'CHECKED_IN'])

export function isLiveBooking(booking: BookingEntry) {
  return LIVE_BOOKING_STATUSES.has(booking.status)
}

export function isInHouseBooking(booking: BookingEntry, today: string) {
  return isLiveBooking(booking) && booking.checkIn <= today && booking.checkOut >= today
}

export function isArrivingBooking(booking: BookingEntry, today: string) {
  return isLiveBooking(booking) && booking.checkIn === today
}

export function isDepartingBooking(booking: BookingEntry, today: string) {
  return isLiveBooking(booking) && booking.checkOut === today
}
