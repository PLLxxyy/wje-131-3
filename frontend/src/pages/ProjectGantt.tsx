import { Alert, Button, DatePicker, Input, Modal, Space, Typography, message } from 'antd';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ProgressBar } from '../components/common/ProgressBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { UserAvatar } from '../components/common/UserAvatar';
import { useProject } from '../hooks/useProject';
import { useProjectStore } from '../stores/projectStore';
import { PhaseStatus, ProjectStatus, TaskPhase } from '../types';
import { formatDate } from '../utils/formatDate';

function offsetPercent(phase: TaskPhase) {
  const start = new Date(phase.plannedStartDate).getTime();
  const end = new Date(phase.plannedEndDate).getTime();
  const duration = Math.max(end - start, 1);
  const yearStart = new Date('2026-03-01').getTime();
  return {
    left: Math.max(0, Math.min(78, ((start - yearStart) / (1000 * 60 * 60 * 24 * 260)) * 100)),
    width: Math.max(10, Math.min(95, (duration / (1000 * 60 * 60 * 24 * 260)) * 100))
  };
}

export function ProjectGantt() {
  const id = Number(useParams().id || 1);
  const { project, loading, refresh } = useProject(id);
  const { delayProject } = useProjectStore();
  const phases = project?.phases || [];
  const [delayModalOpen, setDelayModalOpen] = useState(false);
  const [delayReason, setDelayReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const blockedPhases = phases.filter((phase) => phase.status === PhaseStatus.Blocked);

  const handleDelay = async () => {
    if (!delayReason.trim()) {
      message.warning('请填写延期原因');
      return;
    }
    setSubmitting(true);
    try {
      await delayProject(id, delayReason.trim());
      message.success('项目已标记延期，受阻阶段已自动阻塞');
      setDelayModalOpen(false);
      setDelayReason('');
      void refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>{project?.name || '项目详情'} · 甘特图</Typography.Title>
          <Space>
            <StatusBadge value={project?.status || ProjectStatus.Planning} />
            <Typography.Text type="secondary">{project?.address || '加载中'}</Typography.Text>
          </Space>
        </div>
        <Space>
          {project && project.status !== ProjectStatus.Delayed && project.status !== ProjectStatus.Completed && project.status !== ProjectStatus.Archived && (
            <Button danger onClick={() => setDelayModalOpen(true)}>
              标记延期
            </Button>
          )}
          <DatePicker.RangePicker />
          <Button type="primary">保存日期调整</Button>
        </Space>
      </div>

      {project?.status === ProjectStatus.Delayed && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="项目已延期"
          description={
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <div>
                <Typography.Text strong>延期原因：</Typography.Text>
                <Typography.Text>{project.delayReason || '未填写'}</Typography.Text>
              </div>
              {blockedPhases.length > 0 && (
                <div>
                  <Typography.Text strong>受阻阶段：</Typography.Text>
                  <Space size={8}>
                    {blockedPhases.map((phase) => (
                      <StatusBadge key={phase.id} value={phase.status} />
                    ))}
                    <Typography.Text type="secondary">
                      {blockedPhases.map((p) => p.name).join('、')}
                    </Typography.Text>
                  </Space>
                </div>
              )}
            </Space>
          }
        />
      )}

      <div className="surface">
        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          <ProgressBar value={project?.progress || 0} />
          {loading ? (
            <Typography.Text>加载中...</Typography.Text>
          ) : (
            phases.map((phase) => {
              const style = offsetPercent(phase);
              return (
                <div className="gantt-row" key={phase.id}>
                  <div>
                    <Typography.Text strong>{phase.name}</Typography.Text>
                    <br />
                    <Space>
                      <StatusBadge value={phase.status} />
                      <UserAvatar name={phase.owner?.name} />
                    </Space>
                  </div>
                  <div className="gantt-track" aria-label={`${phase.name} 时间线`}>
                    <div className="gantt-bar" style={{ left: `${style.left}%`, width: `${style.width}%` }} />
                  </div>
                  <div>
                    <Typography.Text type="secondary">{formatDate(phase.plannedStartDate)}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary">{formatDate(phase.plannedEndDate)}</Typography.Text>
                  </div>
                </div>
              );
            })
          )}
        </Space>
      </div>

      <Modal
        title="标记项目延期"
        open={delayModalOpen}
        onOk={handleDelay}
        onCancel={() => setDelayModalOpen(false)}
        confirmLoading={submitting}
        okText="确认延期"
        okButtonProps={{ danger: true, disabled: !delayReason.trim() }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="标记延期后将自动："
            description={
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                <li>将进行中的阶段标记为「阻塞」</li>
                <li>将阻塞阶段下的子任务状态设为「暂停」</li>
              </ul>
            }
          />
          <div>
            <Typography.Text strong>
              <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
              延期原因
            </Typography.Text>
            <Input.TextArea
              value={delayReason}
              onChange={(e) => setDelayReason(e.target.value)}
              placeholder="请详细描述延期原因，如材料供应延迟、天气影响、设计变更等"
              rows={4}
              maxLength={500}
              showCount
              status={!delayReason.trim() && delayReason.length > 0 ? 'error' : ''}
            />
            {!delayReason.trim() && delayReason.length > 0 && (
              <Typography.Text type="danger" style={{ fontSize: 12 }}>
                延期原因不能为空
              </Typography.Text>
            )}
          </div>
        </Space>
      </Modal>
    </>
  );
}
