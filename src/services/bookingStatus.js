// src/services/bookingStatus.js — статусы брони.
// Вынесены в отдельный модуль, чтобы objectService.js мог ссылаться
// на BOOKING_STATUS.CANCELLED без циклического импорта bookingService.js.
const BOOKING_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export { BOOKING_STATUS };
