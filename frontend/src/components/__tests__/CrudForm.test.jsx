/**
 * Test suite komponen CrudForm — Jest + React Testing Library
 * ------------------------------------------------------------
 * Kontrak komponen yang diuji:
 *
 *   <CrudForm
 *     initialData={{ name: '', email: '' }}  // opsional (mode edit)
 *     onSubmit={(values) => Promise|void}    // dipanggil dengan nilai form valid
 *     onCancel={() => void}                  // opsional
 *     isSubmitting={false}                   // opsional (state loading)
 *     serverError={null}                     // opsional (pesan error dari API)
 *   />
 *
 * Elemen yang diharapkan ada di komponen:
 *   - input  label "Nama"  (name="name")
 *   - input  label "Email" (name="email", type="email")
 *   - button submit "Simpan" -> teks berubah "Menyimpan..." saat isSubmitting
 *   - button "Batal" (type="button")
 *   - pesan error (validasi & server) memakai role="alert"
 *
 * Menjalankan: npx jest src/components/__tests__/CrudForm.test.jsx
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CrudForm from '../CrudForm';

describe('CrudForm', () => {
  let user;
  let onSubmit;
  let onCancel;

  beforeEach(() => {
    user = userEvent.setup();
    onSubmit = jest.fn().mockResolvedValue(undefined);
    onCancel = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderCrudForm = (props = {}) =>
    render(<CrudForm onSubmit={onSubmit} onCancel={onCancel} {...props} />);

  const getSubmitButton = () =>
    screen.getByRole('button', { name: /simpan|menyimpan/i });

  const fillForm = async ({ name = 'Produk A', email = 'produk@example.com' } = {}) => {
    await user.type(screen.getByLabelText(/nama/i), name);
    await user.type(screen.getByLabelText(/email/i), email);
  };

  describe('Rendering', () => {
    it('merender semua field form dan tombol aksi', () => {
      renderCrudForm();

      expect(screen.getByLabelText(/nama/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(getSubmitButton()).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /batal/i })).toBeInTheDocument();
    });

    it('mengisi field dengan initialData pada mode edit', () => {
      renderCrudForm({
        initialData: { name: 'Produk Lama', email: 'lama@example.com' },
      });

      expect(screen.getByLabelText(/nama/i)).toHaveValue('Produk Lama');
      expect(screen.getByLabelText(/email/i)).toHaveValue('lama@example.com');
    });

    it('tidak menampilkan pesan error saat pertama dirender', () => {
      renderCrudForm();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Validasi', () => {
    it('menampilkan error validasi saat disubmit dengan field kosong', async () => {
      renderCrudForm();

      await user.click(getSubmitButton());

      expect(await screen.findByText(/nama wajib diisi/i)).toBeInTheDocument();
      expect(screen.getByText(/email wajib diisi/i)).toBeInTheDocument();
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('menampilkan error saat format email tidak valid', async () => {
      renderCrudForm();

      await user.type(screen.getByLabelText(/nama/i), 'Produk A');
      await user.type(screen.getByLabelText(/email/i), 'bukan-email');
      await user.click(getSubmitButton());

      expect(await screen.findByText(/email tidak valid/i)).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('menghilangkan error validasi setelah pengguna memperbaiki input', async () => {
      renderCrudForm();

      await user.click(getSubmitButton());
      expect(await screen.findByText(/nama wajib diisi/i)).toBeInTheDocument();

      await user.type(screen.getByLabelText(/nama/i), 'Produk A');
      await waitFor(() =>
        expect(screen.queryByText(/nama wajib diisi/i)).not.toBeInTheDocument()
      );
    });
  });

  describe('Submit', () => {
    it('memanggil onSubmit dengan nilai form saat data valid', async () => {
      renderCrudForm();

      await fillForm();
      await user.click(getSubmitButton());

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Produk A',
        email: 'produk@example.com',
      });
    });

    it('mengirim perubahan atas initialData pada mode edit', async () => {
      renderCrudForm({
        initialData: { name: 'Lama', email: 'lama@example.com' },
      });

      await user.clear(screen.getByLabelText(/nama/i));
      await user.type(screen.getByLabelText(/nama/i), 'Baru');
      await user.click(getSubmitButton());

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          name: 'Baru',
          email: 'lama@example.com',
        })
      );
    });
  });

  describe('Error handling', () => {
    it('menampilkan serverError dari prop di dalam role="alert"', () => {
      renderCrudForm({ serverError: 'Gagal menyimpan data (HTTP 500)' });

      expect(screen.getByRole('alert')).toHaveTextContent(/gagal menyimpan data/i);
    });

    it('menonaktifkan tombol submit dan menampilkan state loading saat isSubmitting', () => {
      renderCrudForm({ isSubmitting: true });

      expect(getSubmitButton()).toBeDisabled();
      expect(screen.getByRole('button', { name: /menyimpan/i })).toBeInTheDocument();
    });

    it('tidak memanggil onSubmit saat isSubmitting (mencegah double submit)', async () => {
      renderCrudForm({ isSubmitting: true });

      await fillForm();
      await user.click(getSubmitButton());

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Cancel', () => {
    it('memanggil onCancel saat tombol Batal diklik', async () => {
      renderCrudForm();

      await user.click(screen.getByRole('button', { name: /batal/i }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
