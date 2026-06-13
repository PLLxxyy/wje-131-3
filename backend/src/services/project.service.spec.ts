import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialUsage } from '../models/materialUsage.entity';
import { Project } from '../models/project.entity';
import { SubTask } from '../models/subTask.entity';
import { TaskPhase } from '../models/taskPhase.entity';
import { PhaseStatus, ProjectStatus, TaskStatus } from '../types/enums';
import { AuditService } from './audit.service';
import { ProjectService } from './project.service';

const mockProject: Project = {
  id: 1,
  name: '测试项目',
  address: '测试地址',
  contractAmount: '1000000',
  startDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
  status: ProjectStatus.InProgress,
  progress: 50,
  managerId: 1,
  manager: { id: 1, name: '项目经理', email: 'pm@test.com', role: 'ProjectManager' },
  phases: [],
  materialUsages: []
};

const mockPhaseInProgress: TaskPhase = {
  id: 1,
  projectId: 1,
  name: '基础施工',
  plannedStartDate: '2026-01-01',
  plannedEndDate: '2026-03-31',
  percentComplete: 60,
  ownerId: 2,
  owner: { id: 2, name: '工长', email: 'foreman@test.com', role: 'Foreman' },
  priority: 'High' as any,
  status: PhaseStatus.InProgress,
  subTasks: [],
  project: mockProject,
  materialUsages: []
};

const mockSubTask: SubTask = {
  id: 1,
  phaseId: 1,
  name: '挖土',
  description: '土方开挖',
  ownerId: 3,
  owner: { id: 3, name: '工人', email: 'worker@test.com', role: 'Worker' },
  estimatedHours: '40',
  actualHours: '20',
  status: TaskStatus.InProgress,
  phase: mockPhaseInProgress
};

describe('ProjectService - delay validation', () => {
  let service: ProjectService;
  let projectRepo: Repository<Project>;
  let phaseRepo: Repository<TaskPhase>;
  let taskRepo: Repository<SubTask>;
  let auditService: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        {
          provide: getRepositoryToken(Project),
          useClass: Repository
        },
        {
          provide: getRepositoryToken(MaterialUsage),
          useClass: Repository
        },
        {
          provide: getRepositoryToken(TaskPhase),
          useClass: Repository
        },
        {
          provide: getRepositoryToken(SubTask),
          useClass: Repository
        },
        {
          provide: AuditService,
          useValue: { record: jest.fn() }
        }
      ]
    }).compile();

    service = module.get<ProjectService>(ProjectService);
    projectRepo = module.get<Repository<Project>>(getRepositoryToken(Project));
    phaseRepo = module.get<Repository<TaskPhase>>(getRepositoryToken(TaskPhase));
    taskRepo = module.get<Repository<SubTask>>(getRepositoryToken(SubTask));
    auditService = module.get<AuditService>(AuditService);
  });

  describe('delay - 延期原因必填校验', () => {
    beforeEach(() => {
      jest.spyOn(projectRepo, 'findOne').mockResolvedValue({ ...mockProject } as Project);
      jest.spyOn(projectRepo, 'save').mockResolvedValue({ ...mockProject } as Project);
      jest.spyOn(phaseRepo, 'find').mockResolvedValue([{ ...mockPhaseInProgress }]);
      jest.spyOn(phaseRepo, 'save').mockResolvedValue({ ...mockPhaseInProgress });
      jest.spyOn(taskRepo, 'find').mockResolvedValue([{ ...mockSubTask }]);
      jest.spyOn(taskRepo, 'save').mockResolvedValue({ ...mockSubTask });
    });

    it('空字符串原因应抛出 BadRequestException', async () => {
      await expect(service.delay(1, '')).rejects.toThrow(BadRequestException);
      await expect(service.delay(1, '')).rejects.toThrow('延期原因不能为空');
    });

    it('仅空格的原因应抛出 BadRequestException', async () => {
      await expect(service.delay(1, '   ')).rejects.toThrow(BadRequestException);
      await expect(service.delay(1, '   ')).rejects.toThrow('延期原因不能为空');
    });

    it('仅制表符和换行的原因应抛出 BadRequestException', async () => {
      await expect(service.delay(1, '\t\n ')).rejects.toThrow(BadRequestException);
    });

    it('undefined 原因应抛出 BadRequestException', async () => {
      await expect(service.delay(1, undefined as unknown as string)).rejects.toThrow(BadRequestException);
    });

    it('null 原因应抛出 BadRequestException', async () => {
      await expect(service.delay(1, null as unknown as string)).rejects.toThrow(BadRequestException);
    });

    it('校验失败时不应修改项目状态', async () => {
      const saveSpy = jest.spyOn(projectRepo, 'save');
      try {
        await service.delay(1, '');
      } catch {
        /* ignore */
      }
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('校验失败时不应阻塞任何阶段', async () => {
      const phaseSaveSpy = jest.spyOn(phaseRepo, 'save');
      try {
        await service.delay(1, '   ');
      } catch {
        /* ignore */
      }
      expect(phaseSaveSpy).not.toHaveBeenCalled();
    });

    it('校验失败时不应暂停任何子任务', async () => {
      const taskSaveSpy = jest.spyOn(taskRepo, 'save');
      try {
        await service.delay(1, '');
      } catch {
        /* ignore */
      }
      expect(taskSaveSpy).not.toHaveBeenCalled();
    });

    it('校验失败时不应记录审计日志', async () => {
      const auditSpy = jest.spyOn(auditService, 'record');
      try {
        await service.delay(1, '');
      } catch {
        /* ignore */
      }
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('有效原因应正常执行延期流程', async () => {
      const phaseSaveSpy = jest.spyOn(phaseRepo, 'save');
      const taskSaveSpy = jest.spyOn(taskRepo, 'save');
      const auditSpy = jest.spyOn(auditService, 'record');
      const findOneSpy = jest
        .spyOn(projectRepo, 'findOne')
        .mockResolvedValue({ ...mockProject, status: ProjectStatus.Delayed, delayReason: '材料供应延迟' } as Project);

      const result = await service.delay(1, '材料供应延迟');

      expect(result.status).toBe(ProjectStatus.Delayed);
      expect(result.delayReason).toBe('材料供应延迟');
      expect(phaseSaveSpy).toHaveBeenCalled();
      expect(taskSaveSpy).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith('project.delay', 'Project', 1, 1, {
        delayReason: '材料供应延迟',
        blockedPhases: expect.any(Array)
      });
      findOneSpy.mockRestore();
    });

    it('项目不存在时应抛出 NotFoundException', async () => {
      jest.spyOn(projectRepo, 'findOne').mockResolvedValue(null);
      await expect(service.delay(999, '合法原因')).rejects.toThrow(NotFoundException);
    });
  });
});
