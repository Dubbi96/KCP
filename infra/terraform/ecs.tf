# ---------------------------------------------------------------------------
# ECS Task Definition
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "kcp" {
  family                   = "${local.name_prefix}-kcp"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = data.terraform_remote_state.kcd.outputs.ecs_execution_role_arn

  container_definitions = jsonencode([
    {
      name      = "kcp"
      image     = "${data.terraform_remote_state.kcd.outputs.kcp_ecr_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 4100
          hostPort      = 4100
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "DB_HOST", value = split(":", data.terraform_remote_state.kcd.outputs.kcp_rds_endpoint)[0] },
        { name = "DB_PORT", value = "5432" },
        { name = "DB_DATABASE", value = "katab_control_plane" },
        { name = "DB_USERNAME", value = var.db_username },
        { name = "DB_PASSWORD", value = var.db_password },
        { name = "PORT", value = "4100" },
        { name = "NODE_ENV", value = var.environment },
        { name = "NODE_HEARTBEAT_TIMEOUT_SEC", value = "90" },
        { name = "LEASE_DEFAULT_TTL_SEC", value = "3600" },
        { name = "CORS_ORIGIN", value = "*" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = data.terraform_remote_state.kcd.outputs.kcp_log_group
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "kcp"
        }
      }
    }
  ])

  tags = local.tags
}

# ---------------------------------------------------------------------------
# ECS Service
# ---------------------------------------------------------------------------
resource "aws_ecs_service" "kcp" {
  name            = "${local.name_prefix}-kcp"
  cluster         = data.terraform_remote_state.kcd.outputs.ecs_cluster_arn
  task_definition = aws_ecs_task_definition.kcp.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.terraform_remote_state.kcd.outputs.private_subnet_ids
    security_groups  = [data.terraform_remote_state.kcd.outputs.ecs_sg_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = data.terraform_remote_state.kcd.outputs.kcp_target_group_arn
    container_name   = "kcp"
    container_port   = 4100
  }

  tags = local.tags
}
