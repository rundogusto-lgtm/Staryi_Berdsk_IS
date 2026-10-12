// tests/exceptions.test.mjs — тесты нормализации ошибок.
// Функции чистые и не зависят от БД, поэтому проверяются напрямую:
// это те самые тексты, которые пользователь видит в уведомлениях.
import { describe, it, expect } from 'vitest';
import {
  ApiError,
  ValidationError,
  NotFoundError,
  ConflictError,
  toUserMessage,
  guard,
} from '../src/exceptions.js';

describe('Иерархия ошибок', () => {
  it('все ошибки наследуются от ApiError и Error', () => {
    expect(new ValidationError('x')).toBeInstanceOf(ApiError);
    expect(new NotFoundError('x')).toBeInstanceOf(ApiError);
    expect(new ConflictError('x')).toBeInstanceOf(ApiError);
    expect(new ApiError('x')).toBeInstanceOf(Error);
  });

  it('каждому типу соответствует свой HTTP-код', () => {
    expect(new ValidationError('x').status).toBe(400);
    expect(new NotFoundError('x').status).toBe(404);
    expect(new ConflictError('x').status).toBe(409);
    expect(new ApiError('x').status).toBe(0);
  });

  it('сохраняет имя класса для отладки', () => {
    expect(new ValidationError('x').name).toBe('ValidationError');
    expect(new NotFoundError('x').name).toBe('NotFoundError');
    expect(new ConflictError('x').name).toBe('ConflictError');
  });
});

describe('toUserMessage', () => {
  it('даёт для ConflictError предупреждение с подсказкой выбора', () => {
    const message = toUserMessage(new ConflictError('Слот уже занят'));

    expect(message.kind).toBe('warning');
    expect(message.title).toBe('Действие недоступно');
    expect(message.text).toContain('Слот уже занят');
    expect(message.text).toContain('другой объект или дату');
  });

  it('даёт для ValidationError предупреждение с подсказкой проверки полей', () => {
    const message = toUserMessage(new ValidationError('Превышена вместимость'));

    expect(message.kind).toBe('warning');
    expect(message.title).toBe('Ошибка ввода');
    expect(message.text).toContain('Проверьте заполненные поля');
  });

  it('даёт для NotFoundError предупреждение с предложением обновить страницу', () => {
    const message = toUserMessage(new NotFoundError('Объект не найден'));

    expect(message.kind).toBe('warning');
    expect(message.title).toBe('Объект не найден');
    expect(message.text).toContain('Обновите страницу');
  });

  it('различает сетевую ошибку (статус 0) и ошибку сервера', () => {
    const offline = toUserMessage(new ApiError('нет связи', 0));
    const server = toUserMessage(new ApiError('сбой', 500));

    expect(offline.title).toBe('Нет связи с сервером');
    expect(offline.text).toContain('npm start');
    expect(server.title).toBe('Ошибка сервера');
  });

  it('для неизвестной ошибки предлагает посмотреть консоль', () => {
    const message = toUserMessage(new TypeError('x is not a function'));

    expect(message.kind).toBe('error');
    expect(message.title).toBe('Непредвиденная ошибка');
    expect(message.text).toContain('консоли браузера');
  });

  it('тексты не содержат технических деталей вроде стектрейса', () => {
    const message = toUserMessage(new ApiError('boom', 500));
    expect(message.text).not.toContain('at ');
  });
});

describe('guard', () => {
  it('возвращает данные при успешной операции', async () => {
    const result = await guard(async () => 42);

    expect(result).toEqual({ ok: true, data: 42 });
  });

  it('превращает ApiError в нормализованное сообщение', async () => {
    const result = await guard(async () => {
      throw new ConflictError('Слот уже занят');
    });

    expect(result.ok).toBe(false);
    expect(result.message.title).toBe('Действие недоступно');
  });

  it('не бросает наружу неизвестную ошибку', async () => {
    const result = await guard(async () => {
      throw new TypeError('boom');
    });

    expect(result.ok).toBe(false);
    expect(result.message.kind).toBe('error');
  });
});