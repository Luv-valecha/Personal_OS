"use server";
import { crud, safe } from "@/lib/crud";
import { projectSchema, devProjectSchema } from "@/lib/validation";
const projects = crud("projects", projectSchema, { kind: "project", labelKey: "name", json: ["links"], touch: true });
const dev = crud("dev_projects", devProjectSchema, { kind: "developer", labelKey: "name", json: ["todos"] });
export async function createProject(input) { return safe(() => projects.create(input)); }
export async function updateProject(id, input) { return safe(() => projects.update(id, input)); }
export async function deleteProject(id) { return safe(() => projects.remove(id)); }
export async function createDevProject(input) { return safe(() => dev.create(input)); }
export async function updateDevProject(id, input) { return safe(() => dev.update(id, input)); }
export async function deleteDevProject(id) { return safe(() => dev.remove(id)); }
