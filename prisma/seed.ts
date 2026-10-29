/**
 * ============================================================
 *  prisma/seed.ts — Seeder Data Dummy (Development) — Project DBG
 * ============================================================
 *
 *  SKEMA DATABASE (salin ke prisma/schema.prisma):
 *
 *  generator client {
 *    provider = 'prisma-client-js'
 *  }
 *
 *  datasource db {
 *    provider = 'postgresql'
 *    url      = env('DATABASE_URL')
 *  }
 *
 *  enum ProjectStatus {
 *    PLANNED
 *    ACTIVE
 *    ON_HOLD
 *    COMPLETED
 *    CANCELLED
 *  }
 *
 *  enum TaskStatus {
 *    TODO
 *    IN_PROGRESS
 *    IN_REVIEW
 *    DONE
 *    BLOCKED
 *  }
 *
 *  enum TaskPriority {
 *    LOW
 *    MEDIUM
 *    HIGH
 *    URGENT
 *  }
 *
 *  model Role {
 *    id          Int      @id @default(autoincrement())
 *    name        String   @unique
 *    description String?
 *    users       User[]
 *
 *    @@map('roles')
 *  }
 *
 *  model User {
 *    id              Int       @id @default(autoincrement())
 *    name            String
 *    email           String    @unique
 *    passwordHash    String
 *    isActive        Boolean   @default(true)
 *    roleId          Int
 *    role            Role      @relation(fields: [roleId], references: [id])
 *    managedProjects Project[] @relation('ProjectManager')
 *    assignedTasks   Task[]
 *    createdAt       DateTime  @default(now())
 *    updatedAt       DateTime  @updatedAt
 *
 *    @@index([roleId])
 *    @@map('users')
 *  }
 *
 *  model Customer {
 *    id        Int       @id @default(autoincrement())
 *    name      String
 *    email     String    @unique
 *    phone     String?
 *    company   String?
 *    projects  Project[]
 *    createdAt DateTime  @default(now())
 *
 *    @@map('customers')
 *  }
 *
 *  model Project {
 *    id          Int           @id @default(autoincrement())
 *    code        String        @unique
 *    name        String
 *    description String?
 *    status      ProjectStatus @default(PLANNED)
 *    budget      Decimal       @db.Decimal(15, 2)
 *    startDate   DateTime?
 *    endDate     DateTime?
 *    customerId  Int
 *    customer    Customer      @relation(fields: [customerId], references: [id])
 *    managerId   Int
 *    manager     User          @relation('ProjectManager', fields: [managerId], references: [id])
 *    tasks       Task[]
 *    createdAt   DateTime      @default(now())
 *    updatedAt   DateTime      @updatedAt
 *
 *    @@index([customerId])
 *    @@index([managerId])
 *    @@index([status, startDate])
 *    @@map('projects')
 *  }
 *
 *  model Task {
 *    id          Int          @id @default(autoincrement())
 *    title       String
 *    description String?
 *    status      TaskStatus   @default(TODO)
 *    priority    TaskPriority @default(MEDIUM)
 *    dueDate     DateTime?
 *    projectId   Int
 *    project     Project      @relation(fields: [projectId], references: [id])
 *    assigneeId  Int?
 *    assignee    User?        @relation(fields: [assigneeId], references: [id])
 *    createdAt   DateTime     @default(now())
 *    updatedAt   DateTime     @updatedAt
 *
 *    @@unique([projectId, title])
 *    @@index([projectId, status])
 *    @@index([assigneeId, dueDate])
 *    @@map('tasks')
 *  }
 *
 *  INDEKS UNTUK KOLOM SERING DI-QUERY:
 *  - users.role_id               -> filter user per role
 *  - projects.customer_id        -> daftar proyek per pelanggan
 *  - projects.manager_id         -> daftar proyek per manager
 *  - projects(status,start_date) -> filter proyek aktif + sorting tanggal
 *  - tasks(project_id,status)    -> board kanban per proyek
 *  - tasks(assignee_id,due_date) -> daftar task user + reminder deadline
 *  - Unique: users.email, roles.name, customers.email, projects.code,
 *            tasks(project_id,title)
 *
 *  ERD (Mermaid — simpan sebagai docs/ERD.md):
 *
 *  erDiagram
 *    ROLE ||--o{ USER : memiliki
 *    USER ||--o{ PROJECT : mengelola
 *    CUSTOMER ||--o{ PROJECT : memesan
 *    PROJECT ||--o{ TASK : memuat
 *    USER ||--o{ TASK : dikerjakan
 *
 *  CARA PAKAI:
 *  1. npx prisma migrate dev --name init
 *  2. npm install bcrypt @types/bcrypt
 *  3. Tambahkan di package.json:
 *     'prisma': { 'seed': 'ts-node prisma/seed.ts' }
 *  4. npx prisma db seed
 * ============================================================
 */

import {
  PrismaClient,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

interface RoleSeed {
  name: string;
  description: string;
}

interface UserSeed {
  name: string;
  email: string;
  password: string;
  roleName: string;
}

interface CustomerSeed {
  name: string;
  email: string;
  phone: string;
  company: string;
}

interface ProjectSeed {
  code: string;
  name: string;
  description: string;
  customerEmail: string;
  managerEmail: string;
  status: ProjectStatus;
  budget: number;
  startDate: string;
  endDate: string;
}

interface TaskSeed {
  projectCode: string;
  title: string;
  description: string;
  assigneeEmail: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
}

const ROLES: RoleSeed[] = [
  { name: 'ADMIN', description: 'Akses penuh ke seluruh sistem DBG' },
  { name: 'MANAGER', description: 'Mengelola proyek, pelanggan, dan tim' },
  { name: 'USER', description: 'Pengguna biasa, mengerjakan task' },
];

const USERS: UserSeed[] = [
  { name: 'Admin DBG', email: 'admin@dbg.dev', password: 'Admin#123', roleName: 'ADMIN' },
  { name: 'Budi Santoso', email: 'budi@dbg.dev', password: 'Manager#123', roleName: 'MANAGER' },
  { name: 'Sari Wijaya', email: 'sari@dbg.dev', password: 'Manager#123', roleName: 'MANAGER' },
  { name: 'Andi Pratama', email: 'andi@dbg.dev', password: 'User#123', roleName: 'USER' },
  { name: 'Rina Melati', email: 'rina@dbg.dev', password: 'User#123', roleName: 'USER' },
];

const CUSTOMERS: CustomerSeed[] = [
  { name: 'PT Maju Bersama', email: 'contact@majubersama.co.id', phone: '+62-21-555-0101', company: 'Maju Group' },
  { name: 'CV Kreatif Digital', email: 'hello@kreatifdigital.id', phone: '+62-22-555-0102', company: 'Kreatif Digital' },
  { name: 'PT Sinar Teknologi', email: 'info@sinartech.com', phone: '+62-31-555-0103', company: 'Sinar Tech' },
];

const PROJECTS: ProjectSeed[] = [
  {
    code: 'DBG-001',
    name: 'Implementasi ERP Modul Finance',
    description: 'Penerapan modul finance ERP untuk PT Maju Bersama.',
    customerEmail: 'contact@majubersama.co.id',
    managerEmail: 'budi@dbg.dev',
    status: ProjectStatus.ACTIVE,
    budget: 750000000,
    startDate: '2025-01-15',
    endDate: '2025-08-30',
  },
  {
    code: 'DBG-002',
    name: 'Redesign Website Kreatif Digital',
    description: 'Pembuatan ulang website company profile dan landing page.',
    customerEmail: 'hello@kreatifdigital.id',
    managerEmail: 'sari@dbg.dev',
    status: ProjectStatus.ACTIVE,
    budget: 150000000,
    startDate: '2025-03-01',
    endDate: '2025-06-15',
  },
  {
    code: 'DBG-003',
    name: 'Mobile App Sinar Tech',
    description: 'Pengembangan aplikasi mobile loyalty customer.',
    customerEmail: 'info@sinartech.com',
    managerEmail: 'budi@dbg.dev',
    status: ProjectStatus.PLANNED,
    budget: 900000000,
    startDate: '2025-07-01',
    endDate: '2026-01-31',
  },
  {
    code: 'DBG-004',
    name: 'Migrasi Data Legacy',
    description: 'Migrasi data legacy ke PostgreSQL.',
    customerEmail: 'contact@majubersama.co.id',
    managerEmail: 'sari@dbg.dev',
    status: ProjectStatus.COMPLETED,
    budget: 300000000,
    startDate: '2024-05-01',
    endDate: '2024-12-20',
  },
];

const TASKS: TaskSeed[] = [
  {
    projectCode: 'DBG-001',
    title: 'Analisis kebutuhan modul general ledger',
    description: 'Wawancara stakeholder dan dokumentasi kebutuhan.',
    assigneeEmail: 'andi@dbg.dev',
    status: TaskStatus.DONE,
    priority: TaskPriority.HIGH,
    dueDate: '2025-02-28',
  },
  {
    projectCode: 'DBG-001',
    title: 'Konfigurasi chart of accounts',
    description: 'Setup COA sesuai struktur perusahaan klien.',
    assigneeEmail: 'rina@dbg.dev',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.MEDIUM,
    dueDate: '2025-04-15',
  },
  {
    projectCode: 'DBG-001',
    title: 'UAT modul finance',
    description: 'Pengujian penerimaan bersama tim klien.',
    assigneeEmail: 'andi@dbg.dev',
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    dueDate: '2025-07-31',
  },
  {
    projectCode: 'DBG-002',
    title: 'Wireframe halaman utama',
    description: 'Desain wireframe dan review bersama klien.',
    assigneeEmail: 'rina@dbg.dev',
    status: TaskStatus.DONE,
    priority: TaskPriority.MEDIUM,
    dueDate: '2025-03-20',
  },
  {
    projectCode: 'DBG-002',
    title: 'Implementasi frontend responsive',
    description: 'Konversi desain ke komponen frontend.',
    assigneeEmail: 'andi@dbg.dev',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: '2025-05-10',
  },
  {
    projectCode: 'DBG-003',
    title: 'Setup infrastruktur mobile',
    description: 'Persiapan CI/CD dan environment mobile.',
    assigneeEmail: null,
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    dueDate: '2025-07-15',
  },
];

async function seedRoles(): Promise<void> {
  console.log('> Seeding roles...');
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
}

async function seedUsers(): Promise<void> {
  console.log('> Seeding users...');
  for (const user of USERS) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: user.roleName },
    });
    const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, roleId: role.id, passwordHash },
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        roleId: role.id,
      },
    });
  }
}

async function seedCustomers(): Promise<void> {
  console.log('> Seeding customers...');
  for (const customer of CUSTOMERS) {
    await prisma.customer.upsert({
      where: { email: customer.email },
      update: {
        name: customer.name,
        phone: customer.phone,
        company: customer.company,
      },
      create: customer,
    });
  }
}

async function seedProjects(): Promise<void> {
  console.log('> Seeding projects...');
  for (const project of PROJECTS) {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { email: project.customerEmail },
    });
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: project.managerEmail },
    });
    const data = {
      name: project.name,
      description: project.description,
      status: project.status,
      budget: project.budget,
      startDate: new Date(project.startDate),
      endDate: new Date(project.endDate),
      customerId: customer.id,
      managerId: manager.id,
    };
    await prisma.project.upsert({
      where: { code: project.code },
      update: data,
      create: { code: project.code, ...data },
    });
  }
}

async function seedTasks(): Promise<void> {
  console.log('> Seeding tasks...');
  for (const task of TASKS) {
    const project = await prisma.project.findUniqueOrThrow({
      where: { code: task.projectCode },
    });
    const assignee = task.assigneeEmail
      ? await prisma.user.findUniqueOrThrow({ where: { email: task.assigneeEmail } })
      : null;
    const data = {
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? new Date(task.dueDate) : null,
      assigneeId: assignee ? assignee.id : null,
    };
    await prisma.task.upsert({
      where: { projectId_title: { projectId: project.id, title: task.title } },
      update: data,
      create: {
        title: task.title,
        projectId: project.id,
        ...data,
      },
    });
  }
}

async function main(): Promise<void> {
  console.log('Memulai seeding database DBG...');
  await seedRoles();
  await seedUsers();
  await seedCustomers();
  await seedProjects();
  await seedTasks();
  console.log('Seeding selesai. Login dev: admin@dbg.dev / Admin#123');
}

main()
  .catch((error) => {
    console.error('Gagal seeding:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
