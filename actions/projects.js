"use server";
import { safe } from "@/lib/crud";
import { projectsSvc as projects, devProjectsSvc as dev, projectDeleteImpact } from "@/lib/services";
export async function createProject(input) { return safe(() => projects.create(input)); }
export async function updateProject(id, input) { return safe(() => projects.update(id, input)); }
export async function deleteProject(id) { return safe(() => projects.remove(id)); }
export async function createDevProject(input) { return safe(() => dev.create(input)); }
export async function updateDevProject(id, input) { return safe(() => dev.update(id, input)); }
export async function deleteDevProject(id) { return safe(() => dev.remove(id)); }
export async function getProjectDeleteImpact(id) { return safe(() => projectDeleteImpact(id), { read: true }); }
