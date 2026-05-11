import { Repositories } from '../data/repositories';

export class DirectoryService {
  constructor(private repos: Repositories) {}
  listTenants() {
    return this.repos.listTenants();
  }
  listAgents(tenantId: string) {
    return this.repos.listAgents(tenantId);
  }
  listCustomers(tenantId: string) {
    return this.repos.listCustomers(tenantId);
  }
}
